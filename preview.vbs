Option Explicit
Dim shell, fs, folder, escapedFolder, command
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
folder = fs.GetParentFolderName(WScript.ScriptFullName)
escapedFolder = Replace(folder, "'", "''")
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command " & _
  Chr(34) & "$python = (Get-Command py -ErrorAction SilentlyContinue).Source; " & _
  "if (-not $python) { $python = (Get-Command python -ErrorAction Stop).Source }; " & _
  "Start-Process -FilePath $python -ArgumentList '-m','http.server','4174','--directory','src' " & _
  "-WorkingDirectory '" & escapedFolder & "' -WindowStyle Hidden" & Chr(34)
shell.Run command, 0, False
WScript.Sleep 700
shell.Run "http://127.0.0.1:4174/?v=2947c57", 1, False
