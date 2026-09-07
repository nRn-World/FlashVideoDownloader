@echo off
setlocal
cd /d "%~dp0"
set PYTHONDONTWRITEBYTECODE=1
echo Preparing Chrome Web Store package...
python prepare_store_assets.py
if errorlevel 1 (
  echo.
  echo ERROR: prepare_store_assets.py failed.
  echo Install Python 3 and Pillow: pip install Pillow
  pause
  exit /b 1
)
if exist "__pycache__" rmdir /s /q "__pycache__"
echo.
echo Ready for Chrome Web Store upload:
echo   ZIP: Flash Video Downloader.zip
echo   Screenshots: Screenshots\store\*-1280x800.png
echo.
echo Remember: publish privacy.html online before submitting.
pause
