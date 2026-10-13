<#
  Assistente Virtual: instalação pelo PowerShell

  Completa (recomendada):
      irm https://mello13256.github.io/Assistente-Virtual/instalar.ps1 | iex
  Leve (só o app, ~200 MB):
      & ([scriptblock]::Create((irm https://mello13256.github.io/Assistente-Virtual/instalar.ps1))) -Leve

  Baixa a versão mais recente das Releases do GitHub (retomando downloads interrompidos),
  confere o tamanho e o SHA-256 de cada arquivo e abre o instalador.
#>
param(
    [switch]$Leve,                 # só o app; modelos de voz baixam sob demanda
    [switch]$SoBaixar,             # baixa e confere, sem abrir o instalador
    [switch]$SoPlanejar,           # só mostra o que seria baixado
    [string]$Pasta = (Join-Path ([IO.Path]::GetTempPath()) 'AssistenteVirtual-instalador'),
    [string]$Repo = 'mello13256/Assistente-Virtual',
    [string[]]$Somente = @()       # (testes) baixa só estes arquivos
)

$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072 } catch { }
Add-Type -AssemblyName System.Net.Http

$UserAgent = 'AssistenteVirtual-instalador'
$NoWindows = ($PSVersionTable.PSEdition -eq 'Core') -and (-not $IsWindows)

function Say([string]$texto, [string]$cor = 'Gray') { Write-Host $texto -ForegroundColor $cor }
function Mb([double]$bytes) { '{0:N1} MB' -f ($bytes / 1MB) }
function Gb([double]$bytes) { if ($bytes -ge 1GB) { '{0:N2} GB' -f ($bytes / 1GB) } else { Mb $bytes } }

Say ''
Say '  ●  Assistente Virtual' 'Cyan'
Say '     a IA que enxerga sua tela' 'DarkGray'
Say ''

# ------------------------------------------------------------------ versão mais recente
$api = "https://api.github.com/repos/$Repo/releases/latest"
try {
    $release = Invoke-RestMethod -Uri $api -Headers @{ 'User-Agent' = $UserAgent; 'Accept' = 'application/vnd.github+json' }
} catch {
    throw "Não consegui falar com o GitHub ($($_.Exception.Message)). Confira a internet e tente de novo."
}
$assets = @{}
foreach ($a in $release.assets) { $assets[$a.name] = $a }

$nomes = @()
if ($Leve) {
    $nomes = @('AssistenteVirtual-Update.exe')
} else {
    if ($assets.ContainsKey('manifest.json')) {
        try {
            $manifest = Invoke-RestMethod -Uri $assets['manifest.json'].browser_download_url -Headers @{ 'User-Agent' = $UserAgent }
            $nomes = @($manifest.full)
        } catch { $nomes = @() }
    }
    if ($nomes.Count -eq 0) {
        $nomes = @($assets.Keys | Where-Object { $_ -like 'AssistenteVirtual-Setup*' } | Sort-Object)
    }
}
if ($Somente.Count -gt 0) { $nomes = @($nomes | Where-Object { $Somente -contains $_ }) }
$arquivos = @($nomes | Where-Object { $assets.ContainsKey($_) } | ForEach-Object { $assets[$_] })
if ($arquivos.Count -eq 0) { throw 'A versão mais recente não tem os arquivos do instalador.' }

$total = ($arquivos | Measure-Object -Property size -Sum).Sum
$versao = "$($release.tag_name)".TrimStart('v')
$tipo = if ($Leve) { 'leve (só o app)' } else { 'completa (app + voz na placa de vídeo + modelos + Ollama)' }
Say "  Versão $versao, instalação $tipo" 'White'
Say "  $($arquivos.Count) arquivo(s), $(Gb $total) no total" 'DarkGray'
foreach ($a in $arquivos) { Say ("    - {0,-34} {1,12}" -f $a.name, (Gb $a.size)) 'DarkGray' }
Say ''
if ($SoPlanejar) { return }

# ------------------------------------------------------------------ espaço em disco
$destino = Join-Path $Pasta $versao
New-Item -ItemType Directory -Force -Path $destino | Out-Null
$livre = -1
try { $livre = (New-Object IO.DriveInfo ([IO.Path]::GetPathRoot((Resolve-Path $destino).Path))).AvailableFreeSpace } catch { }
if ($livre -ge 0 -and $livre -lt ($total * 1.05)) {
    throw "Espaço insuficiente em $([IO.Path]::GetPathRoot($destino)): precisa de $(Gb $total), tem $(Gb $livre)."
}

# ------------------------------------------------------------------ download (com retomada)
$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AllowAutoRedirect = $true
$http = New-Object System.Net.Http.HttpClient($handler)
$http.Timeout = [TimeSpan]::FromHours(6)
$http.DefaultRequestHeaders.UserAgent.ParseAdd($UserAgent)

function Get-Sha256([string]$caminho) { (Get-FileHash -Algorithm SHA256 -Path $caminho).Hash.ToLowerInvariant() }

function Test-Arquivo($asset, [string]$caminho) {
    if (-not (Test-Path $caminho)) { return $false }
    if ((Get-Item $caminho).Length -ne [long]$asset.size) { return $false }
    if ($asset.digest -and "$($asset.digest)".StartsWith('sha256:')) {
        return (Get-Sha256 $caminho) -eq "$($asset.digest)".Substring(7).ToLowerInvariant()
    }
    return $true
}

$feito = 0L
$n = 0
foreach ($asset in $arquivos) {
    $n++
    $alvo = Join-Path $destino $asset.name
    $parte = "$alvo.part"
    $rotulo = "[$n/$($arquivos.Count)] $($asset.name)"
    if (Test-Arquivo $asset $alvo) {
        Say "  ✓ $rotulo já baixado" 'Green'
        $feito += [long]$asset.size
        continue
    }
    for ($tentativa = 1; $tentativa -le 4; $tentativa++) {
        $inicio = 0L
        if (Test-Path $parte) { $inicio = (Get-Item $parte).Length }
        if ($inicio -ge [long]$asset.size) { Remove-Item $parte -Force; $inicio = 0L }
        $req = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Get, $asset.browser_download_url)
        if ($inicio -gt 0) { $req.Headers.Range = New-Object System.Net.Http.Headers.RangeHeaderValue($inicio, $null) }
        try {
            $resp = $http.SendAsync($req, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
            [void]$resp.EnsureSuccessStatusCode()
            if ($inicio -gt 0 -and [int]$resp.StatusCode -ne 206) { $inicio = 0L }   # servidor ignorou a retomada
            $modo = if ($inicio -gt 0) { [IO.FileMode]::Append } else { [IO.FileMode]::Create }
            $entrada = $resp.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
            $saida = New-Object IO.FileStream($parte, $modo, [IO.FileAccess]::Write, [IO.FileShare]::None, 1MB)
            try {
                $buf = New-Object byte[] (1MB)
                $lido = $inicio
                $relogio = [Diagnostics.Stopwatch]::StartNew()
                $ultimo = 0
                while (($k = $entrada.Read($buf, 0, $buf.Length)) -gt 0) {
                    $saida.Write($buf, 0, $k)
                    $lido += $k
                    if ($relogio.ElapsedMilliseconds - $ultimo -ge 400) {
                        $ultimo = $relogio.ElapsedMilliseconds
                        $vel = ($lido - $inicio) / [Math]::Max(0.5, $relogio.Elapsed.TotalSeconds)
                        $geral = [int](100 * ($feito + $lido) / $total)
                        $resta = if ($vel -gt 0) { [int](($total - $feito - $lido) / $vel) } else { -1 }
                        Write-Progress -Activity "Baixando o Assistente Virtual $versao ($geral%)" `
                            -Status ("{0}  {1} de {2}  ·  {3}/s" -f $rotulo, (Gb $lido), (Gb $asset.size), (Mb $vel)) `
                            -PercentComplete ([Math]::Min(100, $geral)) -SecondsRemaining $resta
                    }
                }
            } finally { $saida.Dispose(); $entrada.Dispose(); $resp.Dispose() }
            break
        } catch {
            if ($tentativa -eq 4) { throw "Falhou ao baixar $($asset.name): $($_.Exception.Message)" }
            Say "  ! $rotulo interrompido, tentando de novo ($tentativa/3)..." 'Yellow'
            Start-Sleep -Seconds ([int][Math]::Pow(2, $tentativa))
        }
    }
    if (Test-Path $alvo) { Remove-Item $alvo -Force }
    Move-Item $parte $alvo
    if (-not (Test-Arquivo $asset $alvo)) {
        Remove-Item $alvo -Force
        throw "O arquivo $($asset.name) chegou corrompido (tamanho ou SHA-256 não conferem). Rode de novo."
    }
    $feito += [long]$asset.size
    Say "  ✓ $rotulo ($(Gb $asset.size), SHA-256 conferido)" 'Green'
}
Write-Progress -Activity 'Baixando o Assistente Virtual' -Completed
$http.Dispose()

$exe = Join-Path $destino ($(if ($Leve) { 'AssistenteVirtual-Update.exe' } else { 'AssistenteVirtual-Setup.exe' }))
Say ''
if ($SoBaixar -or $Somente.Count -gt 0) { Say "  Arquivos em $destino" 'Cyan'; return }
if ($NoWindows) { Say "  Baixado em $destino. O instalador só roda no Windows." 'Yellow'; return }

# ------------------------------------------------------------------ instalar
Say '  Abrindo o instalador...' 'Cyan'
$p = Start-Process -FilePath $exe -WorkingDirectory $destino -PassThru
$p.WaitForExit()
if ($p.ExitCode -eq 0) {
    Say '  ✓ Pronto! O Assistente Virtual está instalado. Procure o ícone de olho perto do relógio.' 'Green'
    try { Remove-Item $destino -Recurse -Force } catch { }
} else {
    Say "  O instalador terminou com o código $($p.ExitCode). Os arquivos continuam em $destino." 'Yellow'
}
