# Atomic 部署脚本 - 在目标服务器 (10.70.0.52) 上运行，使用 NSSM 部署

param(
    [switch]$SkipDockerInstall
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Atomic 知识库系统 NSSM 部署脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 检查 NSSM
Write-Host "[1/5] 检查 NSSM..." -ForegroundColor Green
$nssmOk = $false
try {
    nssm --version 2>$null | Out-Null
    $nssmOk = $true
    Write-Host "  NSSM 已安装" -ForegroundColor White
}
catch {
    if ($SkipDockerInstall) {
        Write-Host "  跳过 NSSM 检查（-SkipDockerInstall）" -ForegroundColor Yellow
    }
    else {
        Write-Host "  NSSM 未安装，请运行:" -ForegroundColor Yellow
        Write-Host "  winget install NSSM" -ForegroundColor Yellow
        exit 1
    }
}

# 2. 创建目录
Write-Host ""
Write-Host "[2/5] 创建部署目录..." -ForegroundColor Green

$dirs = @(
    "D:\atomic\databases\images",
    "D:\atomic\databases\documents",
    "D:\atomic\exports",
    "D:\atomic\logs"
)

foreach ($dir in $dirs) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "  创建: $dir" -ForegroundColor Gray
    }
    else {
        Write-Host "  存在: $dir" -ForegroundColor Gray
    }
}

# 3. 检查二进制和数据
Write-Host ""
Write-Host "[3/5] 检查部署文件..." -ForegroundColor Green

# 检查二进制
$binary = "D:\atomic\atomic-server.exe"
if (Test-Path $binary) {
    $size = [math]::Round((Get-Item $binary).Length / 1MB, 2)
    Write-Host "  二进制: atomic-server.exe ($size MB)" -ForegroundColor White
}
else {
    Write-Host "  警告: 未找到 atomic-server.exe" -ForegroundColor Yellow
    Write-Host "  请将 release 二进制放到 D:\atomic\" -ForegroundColor Yellow
}

# 检查数据库
$dbFiles = Get-ChildItem "D:\atomic\databases\*.db" -ErrorAction SilentlyContinue
if ($dbFiles) {
    Write-Host "  数据库: $($dbFiles.Count) 个" -ForegroundColor White
    foreach ($db in $dbFiles) {
        Write-Host "    - $($db.Name) ($([math]::Round($db.Length/1MB, 2)) MB)" -ForegroundColor Gray
    }
}
else {
    Write-Host "  警告: 未发现数据库文件，请先执行数据迁移" -ForegroundColor Yellow
}

# 4. 配置防火墙
Write-Host ""
Write-Host "[4/5] 配置防火墙..." -ForegroundColor Green

$fwRule = Get-NetFirewallRule -DisplayName "Atomic Server" -ErrorAction SilentlyContinue
if (!$fwRule) {
    New-NetFirewallRule -DisplayName "Atomic Server" `
        -Direction Inbound -Action Allow -Protocol TCP `
        -LocalPort 8080 | Out-Null
    Write-Host "  开放端口: 8080" -ForegroundColor White
}
else {
    Write-Host "  防火墙规则已存在" -ForegroundColor Gray
}

$fwRule2 = Get-NetFirewallRule -DisplayName "Atomic Web" -ErrorAction SilentlyContinue
if (!$fwRule2) {
    New-NetFirewallRule -DisplayName "Atomic Web" `
        -Direction Inbound -Action Allow -Protocol TCP `
        -LocalPort 3000 | Out-Null
    Write-Host "  开放端口: 3000 (前端)" -ForegroundColor White
}
else {
    Write-Host "  前端防火墙规则已存在" -ForegroundColor Gray
}

# 5. 安装 NSSM 服务
Write-Host ""
Write-Host "[5/5] 安装并启动服务..." -ForegroundColor Green

$serviceExists = Get-Service -Name "atomic-server" -ErrorAction SilentlyContinue
if ($serviceExists) {
    Write-Host "  服务已存在，重启中..." -ForegroundColor Yellow
    nssm stop atomic-server 2>$null
    Start-Sleep -Seconds 2
}

nssm install atomic-server $binary
nssm set atomic-server AppDirectory D:\atomic
nssm set atomic-server AppParameters "--data-dir D:\atomic serve --port 8080 --bind 0.0.0.0"
nssm set atomic-server AppEnv "PROVIDER=openrouter;TESSERACT_HOST=http://10.70.0.52:8080;PADDLEOCR_HOST=http://10.70.0.52:8081;ALLOW_ALL_CORS=true"
nssm set atomic-server AppStdout "D:\atomic\logs\stdout.log"
nssm set atomic-server AppStderr "D:\atomic\logs\stderr.log"

nssm start atomic-server

Start-Sleep -Seconds 3

# 检查状态
Write-Host ""
Write-Host "  服务状态:" -ForegroundColor White
$nssmStatus = nssm status atomic-server 2>$null
Write-Host "  $nssmStatus" -ForegroundColor Gray

# 检查健康
Write-Host ""
Write-Host "  检查服务健康状态..." -ForegroundColor White
try {
    $health = Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing -TimeoutSec 10
    if ($health.StatusCode -eq 200) {
        Write-Host "  服务运行正常!" -ForegroundColor Green
    }
}
catch {
    Write-Host "  服务可能还在启动，请稍后检查日志" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "部署完成!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "访问地址:" -ForegroundColor Yellow
Write-Host "  后端: http://10.70.0.52:8080" -ForegroundColor White
Write-Host "  前端: http://10.70.0.52:3000 (需手动部署前端)" -ForegroundColor White
Write-Host ""
Write-Host "常用命令:" -ForegroundColor Cyan
Write-Host "  查看日志: Get-Content D:\atomic\logs\stdout.log -Tail 50 -Wait" -ForegroundColor White
Write-Host "  重启服务: nssm restart atomic-server" -ForegroundColor White
Write-Host "  停止服务: nssm stop atomic-server" -ForegroundColor White
Write-Host "  查看状态: nssm status atomic-server" -ForegroundColor White
Write-Host ""
Write-Host "代码更新:" -ForegroundColor Cyan
Write-Host "  本地: cargo build --release" -ForegroundColor White
Write-Host "  上传: target\release\atomic-server.exe -> D:\atomic\" -ForegroundColor White
Write-Host "  重启: nssm restart atomic-server" -ForegroundColor White
Write-Host ""
