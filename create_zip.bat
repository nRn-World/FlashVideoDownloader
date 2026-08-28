@echo off
setlocal enabledelayedexpansion

set "temp_dir=%temp%\FlashVideoDownloader"
if exist "%temp_dir%" rmdir /s /q "%temp_dir%"
mkdir "%temp_dir%"

echo Kopierar filer for Chrome Web Store...

copy "manifest.json" "%temp_dir%\" >nul
copy "background.js" "%temp_dir%\" >nul
copy "blocked-hosts.js" "%temp_dir%\" >nul
copy "content.js" "%temp_dir%\" >nul
copy "popup.html" "%temp_dir%\" >nul
copy "popup.js" "%temp_dir%\" >nul
copy "popup.css" "%temp_dir%\" >nul
copy "offscreen.html" "%temp_dir%\" >nul
copy "offscreen.js" "%temp_dir%\" >nul
copy "i18n.js" "%temp_dir%\" >nul
copy "storage-handles.js" "%temp_dir%\" >nul
copy "LICENSE" "%temp_dir%\" >nul
copy "THIRD_PARTY_NOTICES.txt" "%temp_dir%\" >nul
copy "privacy.html" "%temp_dir%\" >nul

mkdir "%temp_dir%\icons"
copy "icons\*.png" "%temp_dir%\icons\" >nul

mkdir "%temp_dir%\lib"
copy "lib\mux.min.js" "%temp_dir%\lib\" >nul

if exist "_locales\en\messages.json" (
  mkdir "%temp_dir%\_locales\en"
  mkdir "%temp_dir%\_locales\sv"
  copy "_locales\en\messages.json" "%temp_dir%\_locales\en\" >nul
  copy "_locales\sv\messages.json" "%temp_dir%\_locales\sv\" >nul
)

echo Skapar ZIP-fil...
powershell -command "Compress-Archive -Path '%temp_dir%\*' -DestinationPath 'Flash Video Downloader.zip' -Force"

rmdir /s /q "%temp_dir%"

echo.
echo ZIP klar: Flash Video Downloader.zip
echo Publicera privacy.html online innan du skickar till Chrome Web Store!
echo Se STORE_LISTING.md for full guide.
pause
