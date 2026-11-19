@echo off
rem Lance Enova, l'app de bureau (dossier desktop) : serveur, interface et overlay dans un seul programme,
rem icone dans la zone de notification. Deja lancee : la fenetre principale revient au premier plan.
rem Les raccourcis Bureau et menu Demarrer font la meme chose (npm run raccourcis). Ancienne version dans le
rem navigateur : npm run dev, puis http://127.0.0.1:5173.
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
rem Depuis un terminal de VS Code, Electron tournerait comme un simple Node
set "ELECTRON_RUN_AS_NODE="
rem Ni telemetrie de Prisma (checkpoint.prisma.io), ni verification de version de npm sur Internet
set "CHECKPOINT_DISABLE=1"
set "PRISMA_HIDE_UPDATE_MESSAGE=1"
set "npm_config_update_notifier=false"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Electron n'est pas installe : lance d'abord "npm run installer".
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" "%~dp0desktop"
