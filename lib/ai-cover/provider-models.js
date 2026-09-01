"use strict";
module.exports=Object.freeze({
 ideogram:{model:"ideogram-v4",endpoint:"https://api.ideogram.ai/v1/ideogram-v4/generate"},
 recraft:{model:"recraftv4_1",endpoint:"https://external.api.recraft.ai/v1/images/generations"},
 fal:{model:"fal-ai/flux-2/lora"},runware:{model:process.env.RUNWARE_DEFAULT_MODEL||"runware:100@1",endpoint:"https://api.runware.ai/v1"},
 stability:{model:"sd3.5-large",endpoint:"https://api.stability.ai/v2beta/stable-image/generate/sd3"},
 openai:{model:"gpt-image-2",generate:"https://api.openai.com/v1/images/generations",edit:"https://api.openai.com/v1/images/edits"},
 huggingface:{model:process.env.HF_COVER_MODEL||"black-forest-labs/FLUX.1-Krea-dev"}
});
