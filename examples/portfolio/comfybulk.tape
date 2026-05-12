# VHS terminal clip for the ComfyUI bulk media pipeline.

Output examples/portfolio/output/comfybulk.gif

Set FontSize 18
Set Width 1280
Set Height 720
Set Padding 24
Set Theme "Catppuccin Frappe"

Type "cd ~/projects/comfyui_bulk_python_generator"
Enter
Sleep 400ms
Type "comfybulk --help"
Enter
Sleep 2s
Type "comfybulk pipeline --variant montage --seed 1234 --write-manifest --help"
Enter
Sleep 2s
