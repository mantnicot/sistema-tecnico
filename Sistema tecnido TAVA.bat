@echo off

chcp 65001 >nul

title Sistema tecnido TAVA

cd /d "%~dp0"



where node >nul 2>nul

if errorlevel 1 (

  echo No se encontro Node.js. Instale Node.js desde https://nodejs.org

  pause

  exit /b 1

)



if not exist "node_modules\" (

  echo Instalando dependencias...

  call npm install

  if errorlevel 1 (

    echo Fallo npm install.

    pause

    exit /b 1

  )

)



if not exist ".env" (

  echo.

  echo AVISO: No hay archivo .env — la app corre en modo LOCAL.

  echo Para modo Drive: copie .env.example a .env y configure Google Client ID.

  echo.

)



echo Iniciando TAVA...

echo Cuando vea "ready" en la ventana, abra: http://localhost:5173

call npm run dev



pause

