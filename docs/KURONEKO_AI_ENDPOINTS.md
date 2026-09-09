# KuroNeko / Sylvatica AI contract audit

Audit source: `https://sylvatica.my.id/docs`, category **AI**, reviewed 8 September 2026. Base API is `https://sylvatica.my.id/api`. The documentation accepts `apikey`/`key` query authentication or `X-API-Key`; Nexora deliberately uses only the server-side `X-API-Key` header.

All production calls go through `POST /api/ai/provider`. The browser supplies a provider ID and validated inputs, never an upstream URL or API path. Responses are normalized as chat, image, audio, video, detection, or utility results. KuroNeko's documented success envelope is `status + creator + result`; the adapter also supports the observed `status + creator + data` envelope. Documented failures contain `status:false` and `message` and can use HTTP 400, 401, 403, 404, 429, or 500.

| Name | Category | Upstream endpoint | Method | Required params | Optional params | Multi chat | Production status | Live test |
|---|---|---|---|---|---|---|---|---|
| AI Art Generator | Image | `/api/ai/aiart` | GET | `q` | — | No | Integrated | Pending secret |
| AI Filter | Image transform | `/api/ai/aifilter` | GET | `url` | — | No | Integrated | Pending secret |
| AI Seek (Chat & Image) | Chat + Image | `/api/ai/aiseek` | GET | `prompt` | `model`, `action`, `session_id` | Yes | Integrated | Pending secret |
| AI Song Generator | Audio | `/api/ai/aisong` | GET | `prompt` | `title`, `tags` | No | Integrated | Pending secret |
| Anime to Real | Image transform | `/api/ai/animetoreal` | GET | `url` | — | No | Integrated | Pending secret |
| Bypass AI Detection | Utility | `/api/ai/bypassai` | GET | `q` | — | No | Integrated as **Rewrite Text** | Pending secret |
| ChatGPT | Chat | `/api/ai/chatgpt` | GET | `prompt` | `chat_id`, `auth` | Yes | Integrated | Pending secret |
| Claude Sonnet | Excluded | — | — | — | — | No | **Excluded; no runtime registry, call, fallback, or UI** | Not called |
| DeepAI | Chat | `/api/ai/deepai` | GET | `q` | `model` | Yes | Integrated | Pending secret |
| DeepSeek AI | Chat | `/api/ai/deepsek` | GET | `q` | — | Yes | Integrated | Pending secret |
| Feel Better Bot | Specialized chat | `/api/ai/feeb` | GET | `q` | `session` | Optional | Integrated; not selected by default | Pending secret |
| GPT-5 | Chat | `/api/ai/gpt5` | GET | `q` | — | Yes | Integrated | Pending secret |
| GPTAnon AI | Chat | `/api/ai/gptanon` | GET | `q` | `session` | Yes | Integrated | Pending secret |
| Grammarly AI Detector | Detection | `/api/ai/detectai` | GET | `q` | — | No | Integrated | Pending secret |
| Imagen AI Generator | Image | `/api/ai/imagenai` | GET | `q` | `style` | No | Integrated | Pending secret |
| Image to Prompt | Utility | `/api/ai/img2prompt` | GET | `url` | — | No | Integrated | Pending secret |
| KuroNeko Assistant | Chat | `/api/ai/kuroneko` | GET | `q` | `session` | Yes | Integrated | Pending secret |
| Mistral AI | Chat | `/api/ai/mistral` | GET | `query` | — | Yes | Integrated | Pending secret |
| Nano Banana Image Editor | Image transform | `/api/ai/nanobanana` | GET | `url`, `prompt` | — | No | Integrated | Pending secret |
| NoTrack AI | Chat | `/api/ai/notrack` | GET | `q` | `persona` | Yes | Integrated | Pending secret |
| Nova AI | Chat | `/api/ai/nova` | GET | `q` | — | Yes | Integrated | Pending secret |
| Perplexity | Chat | `/api/ai/perplexity` | GET | `query` | — | Yes | Integrated | Pending secret |
| Qwen AI | Chat | `/api/ai/qwen` | GET | `q` | — | Yes | Integrated | Pending secret |
| Qwen3 AI | Chat | `/api/ai/qwen3` | GET | `q` | — | Yes | Integrated | Pending secret |
| Text to Image | Image | `/api/ai/txt2img` | GET | `prompt` | `ratio` | No | Integrated | Pending secret |
| Text to Speech | Audio | `/api/ai/tts` | GET | `text`, `model` | — | No | Integrated | Pending secret |
| Text to Video | Utility / Video | `/api/ai/text2vid` | GET | `prompt` | `ratio`, `sound` | No | Integrated | Pending secret |
| Toonmix AI (T2I & I2I) | Image + transform | `/api/ai/toonmix` | POST | `q` | `image` | No | Integrated | Pending secret |

## Enumerated options

- AI Seek models: `deepseek/deepseek-chat`, `google/gemini-2.5-flash-lite`, `qwen/qwen-coder-32b`; image mode uses fixed `action=image` selected by the Nexora Image AI adapter.
- Imagen styles: `default`, `realistic`, `anime`, `3d`, `ghibli`.
- NoTrack personas: `normal`, `concise`, `detailed`, `creative`.
- Text-to-video ratios: `auto`, `1:1`, `16:9`, `9:16`; `sound` is boolean.
- Text-to-image exposes ratio; Nexora offers the documented examples `1:1`, `16:9`, and `9:16`.
- Text-to-speech documents model names such as `miku`, `goku`, and `eminem`; because the docs describe examples rather than a closed enumeration, the server validates length instead of inventing an allowlist.

## Limits and result lifetime

The documentation shows daily plan quotas (Common 60, Silver 200+, Gold 300+, Platinum 500+, Ultra 1000+) and a burst protection rule for more than ten requests in one second from the same IP. Nexora therefore defaults to four concurrent provider calls, caps Multi Chat at twelve providers per run, adds its own per-tool API Abuse Shield, and never retries a failed provider automatically. The documentation does not specify a guaranteed lifetime for generated media URLs; Nexora treats them as session results and does not persist them globally.

## Reproducible contract test

`node scripts/test-kuroneko-ai-live.js` performs no network calls by default. A deployment operator can run the complete, sequential smoke test with `KURONEKO_LIVE_TEST=1` and the existing `KURONEKO_API_KEY` secret. It logs only provider ID, success/failure, latency, and normalized output kind—never prompts, media, response bodies, or the key. Generated media endpoints can consume quota, so this is intentionally opt-in.
