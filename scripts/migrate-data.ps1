# Atomic 数据迁移脚本
# 在源机器（10.71.7.23）上运行，将数据迁移到目标服务器（10.70.0.52）

param(
    [string]$TargetServer = "10.70.0.52",
    [string]$TargetPath = "D:\atomic"
)

$SourceDir = "d:\code\atomic"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Atomic 数据迁移脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "源: $SourceDir" -ForegroundColor Yellow
Write-Host "目标: \\$TargetServer\$TargetPath" -ForegroundColor Yellow
Write-Host ""

# 1. 检查源数据
Write-Host "[1/3] 检查源数据..." -ForegroundColor Green

$dbFiles = Get-ChildItem "$SourceDir\databases\*.db" -ErrorAction SilentlyContinue
$imageFiles = Get-ChildItem "$SourceDir\databases\images\*" -ErrorAction SilentlyContinue
$docFiles = Get-ChildItem "$SourceDir\databases\documents\*" -ErrorAction SilentlyContinue
$exportFiles = Get-ChildItem "$SourceDir\exports\*" -ErrorAction SilentlyContinue

Write-Host "  数据库: $($dbFiles.Count) 个" -ForegroundColor White
Write-Host "  图片: $($imageFiles.Count) 个" -ForegroundColor White
Write-Host "  文档: $($docFiles.Count) 个" -ForegroundColor White
Write-Host "  导出: $($exportFiles.Count) 个" -ForegroundColor White

# 2. 打包数据
Write-Host ""
Write-Host "[2/3] 打包数据..." -ForegroundColor Green

$zipPath = "$env:TEMP\atomic-data.zip"
$items = @("databases\*.db", "databases\images", "databases\documents", "exports")

Compress-Archive -Path $items -DestinationPath $zipPath -Force
$zipSize = (Get-Item $zipPath).Length / 1MB
Write-Host "  打包完成: $zipPath ($([math]::Round($zipSize, 2)) MB)" -ForegroundColor White

# 3. 输出传输说明
Write-Host ""
Write-Host "[3/3] 传输数据" -ForegroundColor Green
Write-Host ""
Write-Host "  请将以下文件复制到目标服务器 $TargetServer" -ForegroundColor Yellow
Write-Host ""
Write-Host "  文件: $zipPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "  复制后在目标服务器解压:" -ForegroundColor Cyan
Write-Host "  Expand-Archive -Path atomic-data.zip -DestinationPath D:\atomic -Force" -ForegroundColor Cyan
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "数据迁移完成" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "下一步: 运行 deploy-atomic.ps1 启动服务" -ForegroundColor Yellow
Write-Host ""
