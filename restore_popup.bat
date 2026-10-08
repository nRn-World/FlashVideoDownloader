@echo off
setlocal enabledelayedexpansion

:: Skapa en temporär mapp för att lagra den ursprungliga popup.js
set "temp_dir=%temp%\FlashVideoDownloaderRestore"
if exist "%temp_dir%" rmdir /s /q "%temp_dir%"
mkdir "%temp_dir%"

:: Kopiera den ursprungliga popup.js till temporär mapp
echo Återställer popup.js...
copy "popup.js" "%temp_dir%\popup.js.original" >nul

:: Återställ popup.js från Git (om tillgängligt)
if exist ".git" (
    git checkout HEAD -- popup.js
    echo popup.js har återställts från Git.
) else (
    echo Git är inte tillgängligt. Återställer från säkerhetskopia...
    if exist "%temp_dir%\popup.js.original" (
        copy "%temp_dir%\popup.js.original" "popup.js" >nul
        echo popup.js har återställts från säkerhetskopia.
    ) else (
        echo Ingen säkerhetskopia hittades. Skapar en ny grundläggande popup.js.
        echo // Grundläggande popup.js > "popup.js"
        echo // Lägg till din kod här >> "popup.js"
    )
)

:: Rensa temporär mapp
rmdir /s /q "%temp_dir%"

echo Återställning av popup.js är klar!
pause