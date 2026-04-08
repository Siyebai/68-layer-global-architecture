@echo off
chcp 65001 >nul
echo ================================================================================
echo CONTINUOUS AUTONOMOUS OPERATION
echo ================================================================================
echo.
echo Starting autonomous agent V2...
echo Mode: NO-INSTRUCTION AUTONOMOUS
echo.
echo Features:
echo   - Auto-thinking every minute
echo   - Auto-learning every 5 minutes
echo   - Auto-evaluation every 10 minutes
echo   - Auto-evolution every 30 minutes
echo   - Auto-exploration every 30 minutes
echo.
echo Press Ctrl+C to stop
echo.

:loop
python autonomous_agent_v2.py

echo.
echo Autonomous agent stopped. Restarting in 10 seconds...
echo Press Ctrl+C again to exit completely
echo.
timeout /t 10 /nobreak >nul
goto loop
