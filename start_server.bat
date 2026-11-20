@echo off
title Local HTTP Server - Laser Security Alarm Simulator
echo ============================================================
echo   Starting Local HTTP Server on http://localhost:8080
echo   Digital Electronics Mini-Project Simulator
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$port = 8080; $listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add('http://localhost:' + $port + '/'); $listener.Start(); Write-Host 'Server running at: http://localhost:8080/'; Write-Host 'Press Ctrl+C to stop the server.'; Start-Process 'http://localhost:8080/'; while ($listener.IsListening) { try { $context = $listener.GetContext(); $req = $context.Request; $res = $context.Response; $rawPath = $req.Url.AbsolutePath.TrimStart('/'); if ([string]::IsNullOrEmpty($rawPath)) { $rawPath = 'index.html' }; $filePath = Join-Path -Path $PSScriptRoot -ChildPath $rawPath; if (Test-Path $filePath -PathType Leaf) { $ext = [System.IO.Path]::GetExtension($filePath).ToLower(); $mime = 'text/plain'; switch ($ext) { '.html' { $mime = 'text/html' } '.css' { $mime = 'text/css' } '.js' { $mime = 'application/javascript' } '.json' { $mime = 'application/json' } '.png' { $mime = 'image/png' } '.svg' { $mime = 'image/svg+xml' } } $bytes = [System.IO.File]::ReadAllBytes($filePath); $res.ContentType = $mime; $res.ContentLength64 = $bytes.Length; $res.OutputStream.Write($bytes, 0, $bytes.Length); $res.StatusCode = 200 } else { $res.StatusCode = 404; $err = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found'); $res.OutputStream.Write($err, 0, $err.Length) } $res.OutputStream.Close() } catch {} }"
pause
