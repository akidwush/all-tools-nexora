# Nexora local AI vendor assets

Image Enhancer memuat runtime Local ESRGAN dari origin Nexora sendiri. Jalankan `sh scripts/fetch-ai-vendor.sh` sebelum build/deploy untuk memasang aset pinned berikut:

- TensorFlow.js 4.22.0
- UpscalerJS 1.0.0
- @upscalerjs/esrgan-slim 1.0.0-beta.10, model 2×

Inference tetap berlangsung di browser pengguna. File model dan library hanya disajikan sebagai static assets oleh deployment Nexora.
