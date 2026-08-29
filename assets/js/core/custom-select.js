(function(){
  "use strict";

  if (window.NexoraSelect && window.NexoraSelect.version) return;

  var controls = new WeakMap();
  var enhanced = new Set();
  var openControl = null;
  var idCounter = 0;
  var bodyObserver = null;
  var headObserver = null;
  var rafPosition = 0;

  function isEligible(select){
    if (!select || select.tagName !== "SELECT") return false;
    if (select.classList.contains("nap-native-select")) return false; // Auto PDF already has its dedicated Nexora selector.
    if (select.dataset.nxNativeSelect === "true" || select.dataset.nxSelectIgnore === "true") return false;
    if (select.multiple || Number(select.size || 0) > 1) return false;
    if (select.hidden || select.closest("[hidden]")) return false;
    if (select.getAttribute("aria-hidden") === "true") return false;
    return true;
  }

  function safeCss(value, fallback){
    return value && value !== "normal" && value !== "none" ? value : fallback;
  }

  function escapeCss(value){
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g,function(ch){ return "\\" + ch; });
  }

  function labelFor(select){
    var own = select.getAttribute("aria-label");
    if (own) return own.trim();
    if (select.id){
      var explicit = document.querySelector('label[for="' + escapeCss(select.id) + '"]');
      if (explicit){
        var clone = explicit.cloneNode(true);
        clone.querySelectorAll("select,input,textarea,button,.nx-custom-select").forEach(function(n){ n.remove(); });
        var text = clone.textContent.trim();
        if (text) return text;
      }
    }
    var wrapping = select.closest("label");
    if (wrapping){
      var copy = wrapping.cloneNode(true);
      copy.querySelectorAll("select,input,textarea,button,.nx-custom-select").forEach(function(n){ n.remove(); });
      var label = copy.textContent.trim();
      if (label) return label;
    }
    return "Pilih opsi";
  }

  function selectedText(select){
    var option = select.options[select.selectedIndex];
    return option ? option.textContent.trim() : (select.getAttribute("placeholder") || "Pilih opsi");
  }

  function syncStyle(control, computed){
    if (!computed) computed = getComputedStyle(control.select);
    var root = control.root;
    var trigger = control.trigger;
    var bg = computed.backgroundColor;
    if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") bg = "#0d141e";
    var border = computed.borderTopColor;
    if (!border || border === "rgba(0, 0, 0, 0)" || border === "transparent") border = "rgba(145,164,184,.22)";

    root.style.setProperty("--nx-cs-bg", bg);
    root.style.setProperty("--nx-cs-border", border);
    root.style.setProperty("--nx-cs-radius", safeCss(computed.borderRadius,"12px"));
    root.style.setProperty("--nx-cs-text", safeCss(computed.color,"#edf1f6"));
    root.style.setProperty("--nx-cs-font-family", safeCss(computed.fontFamily,"Inter,Poppins,system-ui,sans-serif"));
    root.style.setProperty("--nx-cs-font-size", safeCss(computed.fontSize,"10px"));
    root.style.setProperty("--nx-cs-font-weight", safeCss(computed.fontWeight,"600"));
    root.style.setProperty("--nx-cs-line-height", safeCss(computed.lineHeight,"normal"));

    var h = parseFloat(computed.height);
    var minH = parseFloat(computed.minHeight);
    var chosenH = Math.max(Number.isFinite(h) ? h : 0, Number.isFinite(minH) ? minH : 0);
    if (chosenH >= 28 && chosenH <= 84) root.style.setProperty("--nx-cs-min-height", Math.round(chosenH) + "px");

    var pl = parseFloat(computed.paddingLeft), pr = parseFloat(computed.paddingRight);
    if (Number.isFinite(pl) && Number.isFinite(pr)){
      root.style.setProperty("--nx-cs-padding", "0 " + Math.max(11,Math.min(18,pr)) + "px 0 " + Math.max(11,Math.min(18,pl)) + "px");
    }

    if (control.compact){
      var w = parseFloat(computed.width);
      if (Number.isFinite(w) && w > 56 && w < 520){
        root.style.setProperty("--nx-cs-natural-width", Math.ceil(w) + "px");
      }
    }

    trigger.title = selectedText(control.select);
  }

  function buildOptions(control){
    var select = control.select;
    var box = control.options;
    var frag = document.createDocumentFragment();
    var selectedValue = select.value;

    Array.from(select.children).forEach(function(child){
      if (child.tagName === "OPTGROUP"){
        var group = document.createElement("div");
        group.className = "nx-custom-select-group";
        group.textContent = child.label || "Pilihan";
        frag.appendChild(group);
        Array.from(child.children).forEach(function(option){ frag.appendChild(optionButton(option)); });
      } else if (child.tagName === "OPTION"){
        frag.appendChild(optionButton(child));
      }
    });

    function optionButton(option){
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nx-custom-select-option";
      btn.setAttribute("role","option");
      btn.dataset.value = option.value;
      btn.disabled = !!option.disabled;
      var selected = option.selected || option.value === selectedValue;
      btn.classList.toggle("is-selected", selected);
      btn.setAttribute("aria-selected", selected ? "true" : "false");

      var radio = document.createElement("span");
      radio.className = "nx-custom-select-radio";
      radio.setAttribute("aria-hidden","true");
      var copy = document.createElement("span");
      copy.className = "nx-custom-select-option-copy";
      copy.textContent = option.textContent.trim();
      btn.append(radio,copy);
      btn.addEventListener("click",function(){ choose(control, option.value); });
      btn.addEventListener("keydown",function(event){ optionKeydown(control,event,btn); });
      return btn;
    }

    box.replaceChildren(frag);
  }

  function sync(control, rebuild){
    if (!control || !control.select.isConnected){
      destroy(control);
      return;
    }
    if (rebuild) buildOptions(control);
    var text = selectedText(control.select);
    control.value.textContent = text;
    control.trigger.title = text;
    control.trigger.disabled = !!control.select.disabled;
    control.root.classList.toggle("is-disabled",!!control.select.disabled);

    Array.from(control.options.querySelectorAll(".nx-custom-select-option")).forEach(function(btn){
      var isSelected = btn.dataset.value === control.select.value;
      btn.classList.toggle("is-selected",isSelected);
      btn.setAttribute("aria-selected",isSelected ? "true" : "false");
    });
  }

  function choose(control,value){
    if (!control || control.select.disabled) return;
    var previous = control.select.value;
    control.select.value = value;
    sync(control,false);
    close(control,true);
    if (previous !== control.select.value){
      control.select.dispatchEvent(new Event("input",{bubbles:true}));
      control.select.dispatchEvent(new Event("change",{bubbles:true}));
    }
  }

  function open(control){
    if (!control || control.select.disabled) return;
    if (openControl && openControl !== control) close(openControl,false);
    sync(control,true);
    openControl = control;
    control.root.classList.add("is-open");
    control.trigger.setAttribute("aria-expanded","true");
    control.popover.hidden = false;
    position(control);
    requestAnimationFrame(function(){
      position(control);
      var selected = control.options.querySelector(".nx-custom-select-option.is-selected:not(:disabled)") || control.options.querySelector(".nx-custom-select-option:not(:disabled)");
      if (selected) selected.focus({preventScroll:true});
    });
  }

  function close(control,restoreFocus){
    if (!control) return;
    control.root.classList.remove("is-open");
    control.trigger.setAttribute("aria-expanded","false");
    control.popover.hidden = true;
    if (openControl === control) openControl = null;
    if (restoreFocus && control.trigger.isConnected) control.trigger.focus({preventScroll:true});
  }

  function position(control){
    if (!control || control.popover.hidden || !control.trigger.isConnected) return;
    var rect = control.trigger.getBoundingClientRect();
    var pop = control.popover;
    var viewportW = document.documentElement.clientWidth || window.innerWidth;
    var viewportH = window.innerHeight || document.documentElement.clientHeight;
    var gap = 7;
    var margin = 10;
    var desired = Math.max(rect.width, Math.min(360, viewportW - margin*2));
    if (rect.width < 190) desired = Math.min(Math.max(220,rect.width),viewportW-margin*2);
    pop.style.width = Math.round(desired) + "px";

    var left = Math.min(Math.max(margin,rect.left),viewportW - desired - margin);
    pop.style.left = Math.round(left) + "px";

    var maxPanel = Math.min(430,viewportH * .62);
    var below = viewportH - rect.bottom - margin;
    var above = rect.top - margin;
    var goAbove = below < Math.min(220,maxPanel) && above > below;
    pop.classList.toggle("is-above",goAbove);

    if (goAbove){
      var panelH = Math.min(pop.scrollHeight || maxPanel,maxPanel,above-gap);
      pop.style.maxHeight = Math.max(130,Math.floor(Math.min(maxPanel,above-gap))) + "px";
      pop.style.top = Math.max(margin,Math.round(rect.top - panelH - gap)) + "px";
    } else {
      pop.style.maxHeight = Math.max(130,Math.floor(Math.min(maxPanel,below-gap))) + "px";
      pop.style.top = Math.round(rect.bottom + gap) + "px";
    }
  }

  function optionKeydown(control,event,current){
    var options = Array.from(control.options.querySelectorAll(".nx-custom-select-option:not(:disabled)"));
    var index = options.indexOf(current);
    if (event.key === "ArrowDown" || event.key === "ArrowUp"){
      event.preventDefault();
      var delta = event.key === "ArrowDown" ? 1 : -1;
      var next = options[(index + delta + options.length) % options.length];
      if (next) next.focus({preventScroll:true});
    } else if (event.key === "Home" || event.key === "End"){
      event.preventDefault();
      var edge = event.key === "Home" ? options[0] : options[options.length-1];
      if (edge) edge.focus({preventScroll:true});
    } else if (event.key === "Escape"){
      event.preventDefault();
      close(control,true);
    } else if (event.key === "Tab"){
      close(control,false);
    }
  }

  function destroy(control){
    if (!control) return;
    if (openControl === control) openControl = null;
    try{ control.observer.disconnect(); }catch(_){ }
    try{ control.popover.remove(); }catch(_){ }
    try{ control.root.remove(); }catch(_){ }
    try{
      control.select.classList.remove("nx-select-native");
      control.select.removeAttribute("aria-hidden");
      if (control.originalTabIndex == null) control.select.removeAttribute("tabindex");
      else control.select.setAttribute("tabindex",control.originalTabIndex);
    }catch(_){ }
    enhanced.delete(control);
    controls.delete(control.select);
  }

  function enhance(select){
    if (!isEligible(select) || controls.has(select)) return controls.get(select) || null;

    var computed = getComputedStyle(select);
    var parent = select.parentElement;
    var parentStyle = parent ? getComputedStyle(parent) : null;
    var compact = select.classList.contains("select-box") || (parent && parent.tagName !== "LABEL" && parentStyle && /flex|inline/.test(parentStyle.display));
    var baseId = select.id || ("nx-select-" + (++idCounter));
    var popupId = baseId + "-nx-menu-" + (++idCounter);

    var root = document.createElement("span");
    root.className = "nx-custom-select" + (compact ? " is-compact" : "");
    root.dataset.nxSelectFor = baseId;

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "nx-custom-select-trigger";
    trigger.setAttribute("aria-haspopup","listbox");
    trigger.setAttribute("aria-expanded","false");
    trigger.setAttribute("aria-controls",popupId);
    trigger.setAttribute("aria-label",select.getAttribute("aria-label") || labelFor(select));

    var value = document.createElement("span");
    value.className = "nx-custom-select-value";
    var chevron = document.createElement("span");
    chevron.className = "nx-custom-select-chevron";
    chevron.setAttribute("aria-hidden","true");
    trigger.append(value,chevron);
    root.appendChild(trigger);

    var popover = document.createElement("div");
    popover.id = popupId;
    popover.className = "nx-custom-select-popover";
    popover.setAttribute("role","listbox");
    popover.setAttribute("aria-label",labelFor(select));
    popover.hidden = true;
    var title = document.createElement("div");
    title.className = "nx-custom-select-title";
    title.textContent = labelFor(select);
    var options = document.createElement("div");
    options.className = "nx-custom-select-options";
    popover.append(title,options);

    var control = {
      select:select, root:root, trigger:trigger, value:value, popover:popover,
      title:title, options:options, compact:compact, originalTabIndex:select.getAttribute("tabindex"), observer:null
    };

    syncStyle(control,computed);
    select.insertAdjacentElement("afterend",root);
    document.body.appendChild(popover);
    select.classList.add("nx-select-native");
    select.setAttribute("aria-hidden","true");
    select.tabIndex = -1;

    // Label-forwarded clicks must never invoke the Android/Chrome native picker.
    select.addEventListener("click",function(event){ if (event.isTrusted) event.preventDefault(); });
    select.addEventListener("change",function(){ sync(control,false); });
    select.addEventListener("input",function(){ sync(control,false); });
    trigger.addEventListener("click",function(event){
      event.preventDefault();
      event.stopPropagation();
      if (popover.hidden) open(control); else close(control,false);
    });
    trigger.addEventListener("keydown",function(event){
      if (["ArrowDown","ArrowUp","Enter"," "].includes(event.key)){
        event.preventDefault();
        open(control);
      } else if (event.key === "Escape") close(control,false);
    });

    control.observer = new MutationObserver(function(mutations){
      var rebuild = mutations.some(function(m){ return m.type === "childList" || (m.target && m.target.tagName === "OPTION"); });
      sync(control,rebuild);
    });
    control.observer.observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:["disabled","selected","label","value"]});

    controls.set(select,control);
    enhanced.add(control);
    sync(control,true);
    return control;
  }

  function scan(root){
    root = root || document;
    if (root.nodeType === 1 && root.matches && root.matches("select")) enhance(root);
    if (root.querySelectorAll) root.querySelectorAll("select").forEach(enhance);
  }

  function refreshAll(){
    enhanced.forEach(function(control){ sync(control,true); });
    scan(document);
  }

  function schedulePosition(){
    if (!openControl || rafPosition) return;
    rafPosition = requestAnimationFrame(function(){ rafPosition = 0; if (openControl) position(openControl); });
  }

  function patchSelectProperties(){
    if (!window.HTMLSelectElement || HTMLSelectElement.prototype.__nxSelectPatched) return;
    ["value","selectedIndex"].forEach(function(prop){
      var descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,prop);
      if (!descriptor || !descriptor.get || !descriptor.set) return;
      try{
        Object.defineProperty(HTMLSelectElement.prototype,prop,{
          configurable:descriptor.configurable,
          enumerable:descriptor.enumerable,
          get:descriptor.get,
          set:function(next){
            descriptor.set.call(this,next);
            var control = controls.get(this);
            if (control) queueMicrotask(function(){ sync(control,false); });
          }
        });
      }catch(_){ }
    });
    try{ Object.defineProperty(HTMLSelectElement.prototype,"__nxSelectPatched",{value:true,configurable:true}); }catch(_){ }
  }

  function init(){
    patchSelectProperties();
    scan(document);
    bodyObserver = new MutationObserver(function(mutations){
      mutations.forEach(function(mutation){
        if (mutation.type === "attributes"){
          if (mutation.target && mutation.target.nodeType === 1 && !mutation.target.hidden) scan(mutation.target);
          return;
        }
        mutation.addedNodes.forEach(function(node){ if (node.nodeType === 1) scan(node); });
        mutation.removedNodes.forEach(function(node){
          if (node.nodeType !== 1) return;
          enhanced.forEach(function(control){ if (!control.select.isConnected) destroy(control); });
        });
      });
    });
    bodyObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["hidden"]});

    headObserver = new MutationObserver(function(){
      // New lazy-loaded tool styles can arrive after the control; keep values/options synced.
      requestAnimationFrame(refreshAll);
    });
    if (document.head) headObserver.observe(document.head,{childList:true});

    document.addEventListener("pointerdown",function(event){
      if (!openControl) return;
      if (openControl.root.contains(event.target) || openControl.popover.contains(event.target)) return;
      close(openControl,false);
    },true);
    document.addEventListener("keydown",function(event){ if (event.key === "Escape" && openControl) close(openControl,true); });
    window.addEventListener("resize",schedulePosition,{passive:true});
    window.addEventListener("orientationchange",schedulePosition,{passive:true});
    document.addEventListener("scroll",schedulePosition,true);
  }

  window.NexoraSelect = {
    version:"1.0.0-global",
    enhance:enhance,
    refresh:refreshAll,
    close:function(){ if (openControl) close(openControl,false); }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
