const assert = require('assert');
const fs = require('fs');

const pkg = require('../package.json');
const performanceJs = fs.readFileSync('assets/js/core/performance.js', 'utf8');
const coreCss = fs.readFileSync('assets/css/core.css', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

assert.equal(pkg.version, '6.4.0');
assert(performanceJs.includes('heroMode=mobileLike?"static":"auto"'));
assert(performanceJs.includes('IntersectionObserver'));
assert(performanceJs.includes('armInteractionRetry'));
assert(performanceJs.includes('interactionRetryUsed=true'));
assert(performanceJs.includes('video.controls=false'));
assert(performanceJs.includes('function suspendPlayback()'));
assert(performanceJs.includes('if(mobileLike){if(!video.paused)video.pause();return;}'));
assert(!performanceJs.includes('autoplayRejected'));
assert(performanceJs.includes('/api/database?resource=settings'));
assert(!performanceJs.includes('else document.documentElement.classList.add("nx-anime-banner-enabled")'));
assert(!coreCss.includes('nx-anime-banner-enabled'));
assert(coreCss.includes('.video-banner video{display:block!important;width:100%;height:100%;object-fit:cover'));
assert(!coreCss.includes('nx-hero-video-toggle'));
assert(!index.includes('data-nx-hero-toggle'));
assert(index.includes('preload="metadata"'));
assert(!index.includes('autoplay=""'));
assert(index.includes('muted=""'));
assert(index.includes('loop=""'));
assert(index.includes('playsinline=""'));

console.log('Nexora hero video tests lulus: desktop autoplay runtime, frame statis Android, dan retry interaksi aman.');
