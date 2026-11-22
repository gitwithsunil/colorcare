# Run ColorCare AI on your PC

## 1. Install Python

Install Python 3.11 or newer from [python.org](https://www.python.org/downloads/). On Windows, select **Add Python to PATH** during installation.

## 2. Get the project

Clone the project repository (replace the placeholder with its Git URL):

```powershell
git clone <repository-url>
cd CC
```

Or download the repository as a ZIP, extract it, then open PowerShell in the extracted project folder.

## 3. Install the app's packages

Run these commands in the project folder:

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

If PowerShell does not allow environment activation, use `.venv\Scripts\python.exe -m pip install -r requirements.txt` to install packages, and run the app with `.venv\Scripts\python.exe app.py`.

## 4. Set up AI (optional)

Color sampling, image pixel sampling, and palette extraction work without an AI key. To enable Gemini chat and image descriptions, copy the example settings file and add your own key:

```powershell
Copy-Item .env.example .env
notepad .env
```

In `.env`, set `GEMINI_API_KEY` to your key. Keep this file private and do not upload it to a public repository. Restart ColorCare after changing the key.

## 5. Start ColorCare

```powershell
python app.py
```

Keep the PowerShell window open. In your browser, visit [http://127.0.0.1:5000](http://127.0.0.1:5000). Press **Ctrl+C** in PowerShell when you want to stop the app.

## 6. Use the app

- Choose **Open Scanner** and allow camera access to sample colors from your webcam.
- Choose **Upload Image** to inspect a photo, sample a pixel, or extract its palette.
- Open **AI Assistant** to ask color questions if Gemini is configured and available.
- Use **Vision Test** for the educational color vision activity; it is not a medical diagnosis.

The webcam works on this local address. A deployed website needs HTTPS for browser camera access.
