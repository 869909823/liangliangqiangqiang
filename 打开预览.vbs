Option Explicit

Dim shell, fileSystem, folder, escapedFolder, command
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
folder = fileSystem.GetParentFolderName(WScript.ScriptFullName)
escapedFolder = Replace(folder, "'", "''")

command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command " & _
  Chr(34) & "$python = (Get-Command py -ErrorAction SilentlyContinue).Source; " & _
  "if (-not $python) { $python = (Get-Command python -ErrorAction Stop).Source }; " & _
  "Start-Process -FilePath $python -ArgumentList '-m','http.server','4173','--directory','src' " & _
  "-WorkingDirectory '" & escapedFolder & "' -WindowStyle Hidden" & Chr(34)

shell.Run command, 0, False
WScript.Sleep 700
shell.Run "http://127.0.0.1:4173/", 1, False
