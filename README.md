# Run ColorCare AI on your Windows PC

Follow these steps in order. **One PowerShell terminal is enough** to install and run the app. Keep it open while using ColorCare.

## 1. Install Python and Git

Install Python 3.11 or newer from [python.org](https://www.python.org/downloads/) and Git from [git-scm.com](https://git-scm.com/download/win). During Python setup, select **Add Python to PATH**.

## 2. Clone the project

Open PowerShell and run:

```powershell
git clone https://github.com/gitwithsunil/colorcare.git
cd colorcare
```

## 3. Create a virtual environment and install packages

Run these commands in the same PowerShell window:

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

If PowerShell blocks activation, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, reopen PowerShell, and activate again. Alternatively, skip activation and use `.venv\Scripts\python.exe` in place of `python` for the remaining commands.

## 4. Configure Gemini AI (optional)

Color scanning and image color tools work without Gemini. To enable AI chat and image descriptions, create a local settings file:

```powershell
Copy-Item .env.example .env
notepad .env
```

In Notepad, set `GEMINI_API_KEY` to your own Google AI Studio key, save, and close the file. Keep your key private; do not post it to GitHub. If you skip this step, the local color tools will still work.

## 5. Run the app

In that same PowerShell window, run:

```powershell
python app.py
```

Wait for Flask to show that it is running, then open [http://127.0.0.1:5000](http://127.0.0.1:5000) in your browser. **Do not close the PowerShell window** while using the app. Press **Ctrl+C** in it to stop ColorCare.

You do not need a second terminal to run the app. Open another PowerShell window only if you want to run commands separately, such as the tests.

## 6. Use the five navigation sections

Use the top navigation bar to move between **Home**, **Live Scanner**, **Image Explorer**, **AI Assistant**, and **Vision Test**.

1. **Home:** overview and shortcuts to the app's tools.
2. **Live Scanner:** allow camera access, then click the video to sample a color from your webcam.
3. **Image Explorer:** upload a JPG, PNG, or WEBP photo to sample a pixel or extract its palette.
4. **AI Assistant:** ask questions if Gemini is configured and available.
5. **Vision Test:** try the educational activity. It is not a medical diagnosis.

The webcam works at the local address above. A public deployment needs HTTPS for browser camera access.
