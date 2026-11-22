# ColorCare AI

ColorCare AI is a Flask web app for exploring colors in a webcam image or uploaded photo. Color sampling and palette extraction run locally. Gemini is optional and provides chat and photo descriptions when configured.

This guide walks from cloning the source code through starting the app and using its main tools.

## What the app does

- **Live Scanner:** asks the browser for webcam access, samples a selected point, and shows an approximate color name plus HEX, RGB, and HSL values.
- **Image Explorer:** loads JPG, PNG, or WEBP images, samples pixels in the browser, and can request a dominant-color palette from the Flask server.
- **AI Assistant:** sends text, recent chat context, and optional image attachments to Gemini. Gemini is optional; local color tools work without it.
- **Voice output:** uses the browser's speech synthesis support.
- **Color Vision:** explains common color vision differences and offers a short educational activity. It is not a medical test.
- **Accessibility settings:** includes larger text, high contrast, reduced motion, and voice preferences.

## Requirements

- Python 3.11 or newer
- Git
- A current browser (Chrome, Edge, or Firefox recommended)
- Optional: a Google Gemini API key for AI chat and image descriptions
- Optional: Node.js if you want to run the browser-side JavaScript checks

## 1. Clone the project

Replace `<repository-url>` with the Git URL for this project:

```bash
git clone <repository-url>
cd CC
```

If you already have the source folder, open a terminal in that folder instead.

## 2. Create and activate a virtual environment

### Windows PowerShell

```powershell
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, run the commands below without activating the environment, using `.venv\Scripts\python.exe` in place of `python`.

### macOS or Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
```

## 3. Install Python packages

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

The packages include Flask, Pillow, NumPy, OpenCV, the Google Gen AI SDK, Requests, and python-dotenv. The local color conversion and palette logic does not require a trained ML model.

## 4. Configure Gemini (optional)

Copy the example environment file:

### Windows PowerShell

```powershell
Copy-Item .env.example .env
```

### macOS or Linux

```bash
cp .env.example .env
```

Edit `.env` and set your own key:

```dotenv
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
PORT=5000
```

Keep the key private. `.env` is excluded from Git. Do not paste a real key into source code, a public repository, screenshots, or deployment logs. If a key has been exposed, revoke it in Google AI Studio and create a replacement. To use the local tools without AI, leave `GEMINI_API_KEY` empty.

The app's AI status only indicates whether a key and client were configured at startup; it does not guarantee that the model is reachable or that the account has quota. Model access, quotas, billing, and latency are controlled by Google and can change. Restart the app after changing `.env`.

## 5. Start the application

From the project directory, with the virtual environment active:

```bash
python app.py
```

Open [http://127.0.0.1:5000](http://127.0.0.1:5000) in your browser. To use another local port, set `PORT` before starting the app, for example in PowerShell:

```powershell
$env:PORT = "5050"
python app.py
```

The Flask development server prints its startup address in the terminal. Keep that terminal open while using the app. Press `Ctrl+C` to stop it.

## 6. Use the tools

1. **Home:** select a tool card to open it. Image Explorer is available from the **Explore images** card; the main navigation links to Home, Live Scanner, AI Assistant, and Vision Test.
2. **Live Scanner:** select **Start camera**, allow browser permission, then click the video to sample a point. Use the camera controls to capture/resume or scan the frame center. Camera permission works on `localhost` and on secure HTTPS deployments.
3. **Image Explorer:** choose or drag in a JPG, PNG, or WEBP image up to 8 MB and 24 megapixels. Click the displayed image to sample a pixel. Use **Extract palette** for a server-generated palette. **Describe with AI** requires a configured and usable Gemini API.
4. **Color results:** use **Copy HEX** to copy a color value and **Speak color** for browser voice output. Clipboard and voice behavior depend on browser support and permissions.
5. **AI Assistant:** enter a question and submit it. You can attach an image for a visual question. Recent conversation context is kept in browser storage. AI responses need internet connectivity, a valid key, model access, and available quota; responses may be slow or unavailable when the provider is under load.
6. **Vision Test:** start the activity and answer six randomly selected questions. Results are for learning and reflection, not diagnosis.

## API endpoints

- `GET /` — serves the app.
- `GET /api/status` — returns whether AI was configured when the server started.
- `POST /api/analyze-image` — validates an uploaded image and returns dimensions and a local palette; `describe=true` optionally requests a Gemini description.
- `POST /api/chat` — sends a chat request to Gemini; the frontend requests a streamed response.

## Run the tests

Python tests:

```bash
python -m unittest discover -s tests -v
```

Browser-side JavaScript checks (requires Node.js):

```bash
node tests/test_frontend.js
```

## How color and ML are handled

ColorCare does not ship a separately trained machine-learning model. HEX, RGB, and HSL values are calculated from sampled pixel values. The scanner samples a small area around the pointer to reduce single-pixel noise. The image palette is generated locally on the Flask server with Pillow quantization; approximate names are selected by comparing colors in CIELAB space. Gemini is the only hosted generative AI component and is used for conversational and image-description features when enabled.

## Deploying the app

For a public deployment, use a Python hosting service that supports WSGI apps and HTTPS. Do not use Flask's built-in development server as the production server.

1. Push the project source to a private or public Git repository. Ensure `.env` and all API keys are excluded; only deploy from a commit that contains no secrets.
2. Create a Python web service on your host and connect the repository.
3. Configure the install command as `python -m pip install -r requirements.txt`.
4. Configure the WSGI start command according to the host's OS and process model. For example, on Linux install Gunicorn (`python -m pip install gunicorn`) and use `gunicorn --bind 0.0.0.0:$PORT app:app`. On Windows, Waitress can be used (`python -m pip install waitress`, then `waitress-serve --listen=0.0.0.0:8000 app:app`). Follow the hosting provider's required port binding if it supplies one.
5. Add `GEMINI_API_KEY` and `GEMINI_MODEL` as private environment variables in the host dashboard if AI is needed. Add `PORT` only if required by the provider. Never commit those values to the repository.
6. Enable HTTPS at the host or its reverse proxy. Browsers generally require HTTPS for webcam access on a deployed site.
7. Open the deployed URL and check the Home page, `/api/status`, image upload/palette, scanner permission, and AI behavior (if configured). The configured status alone does not verify Gemini quota or provider availability.

For production, also configure request timeouts and upload limits at the hosting proxy. The app accepts uploads up to 8 MB and limits total Flask request bodies to 12 MB. Uploaded images are processed for the request and are not saved as app uploads. Browser preferences and recent sample/chat history use local browser storage.

## Troubleshooting

- **`python` is not found:** install Python 3.11+ and enable the PATH option, or use `py` on Windows.
- **Package installation fails:** activate the virtual environment, upgrade pip, and retry. OpenCV wheels may take a little time to download.
- **Camera is unavailable:** use `localhost` locally or HTTPS when deployed, allow camera permission, and close other apps using the camera.
- **Image is rejected:** use JPG, PNG, or WEBP and keep it below both the 8 MB and 24-megapixel limits.
- **AI says it is not configured:** check the `GEMINI_API_KEY` variable in `.env` or the hosting environment settings, then restart/redeploy.
- **AI is configured but does not answer:** check the selected model, key's Google project, AI Studio quota/rate limits, internet access, and server logs. The app cannot bypass provider limits or guarantee a response time.
- **Copy or speech does not work:** check browser permissions and support; clipboard access may require HTTPS or localhost.

## Limitations

- Approximate color names are labels, not authoritative color standards.
- Sampled screen colors can differ from the real object due to lighting, camera white balance, display calibration, and compression.
- Camera, clipboard, and speech support varies by browser and device.
- The color vision activity cannot diagnose a color vision condition. Consult an eye-care professional for assessment.
- Gemini output may be inaccurate and depends on an external service, API key, model availability, and quota.
- Flask's local development server is for development only; deploy behind a production WSGI server and HTTPS.
