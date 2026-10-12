$baseUrl = "http://localhost:3001"
$results = @()
$expected = "Phone number already exists for another lead."

function Log($msg, $color = "White") { Write-Host $msg -ForegroundColor $color }
function Pass($area) { $script:results += [PSCustomObject]@{ Area=$area; Result="PASS" }; Log "  PASS: $area" "Green" }
function Fail($area, $detail) { $script:results += [PSCustomObject]@{ Area=$area; Result="FAIL" }; Log "  FAIL: $area - $detail" "Red" }

function Login($email, $pass) {
    $r = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body ("{`"email`":`"$email`",`"password`":`"$pass`"}")
    return [string]$r.data.token
}

function New-Lead([string]$token, [hashtable]$body) {
    $headers = @{ Authorization = "Bearer $token" }
    try {
        $r = Invoke-RestMethod -Uri "$baseUrl/api/leads" -Method POST -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) -Headers $headers -ErrorAction Stop
        return @{ Ok = $true; Status = 201; Lead = $r.data; Message = "" }
    } catch {
        $status = 0
        $msg = ""
        if ($_.Exception -and $_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
        }
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            $msg = [string]$_.ErrorDetails.Message
        }
        if (-not $msg) { $msg = [string]$_.Exception.Message }
        return @{ Ok = $false; Status = $status; Lead = $null; Message = $msg }
    }
}

function Update-Lead([string]$token, [string]$leadId, [hashtable]$body) {
    $headers = @{ Authorization = "Bearer $token" }
    try {
        $r = Invoke-RestMethod -Uri "$baseUrl/api/leads/$leadId" -Method PUT -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) -Headers $headers -ErrorAction Stop
        return @{ Ok = $true; Status = 200; Lead = $r.data; Message = "" }
    } catch {
        $status = 0
        $msg = ""
        if ($_.Exception -and $_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
        }
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            $msg = [string]$_.ErrorDetails.Message
        }
        if (-not $msg) { $msg = [string]$_.Exception.Message }
        return @{ Ok = $false; Status = $status; Lead = $null; Message = $msg }
    }
}

$run = (Get-Date -Format "yyMMddHHmmss") + (Get-Random -Maximum 999).ToString().PadLeft(3, "0")
function P([int]$n) {
    return "+91-9" + $script:run + $n.ToString().PadLeft(4, "0")
}

Log "`n=== PHONE UNIQUENESS E2E ===" "Cyan"
$admin = Login "admin@dctcrm.com" "password123"
Log "Admin logged" "Yellow"

# TEST 1
$r1 = New-Lead $admin @{firstName="Uniq"; lastName="A"; company="UniqCo"; source="WEBSITE"; phone=(P 1)}
if ($r1.Ok -and $r1.Lead.id) { Pass "TEST1 create unique phone" }
else { Fail "TEST1 create unique phone" "status=$($r1.Status) msg=$($r1.Message)" }

# TEST 2
$r2 = New-Lead $admin @{firstName="Uniq"; lastName="B"; company="UniqCo"; source="WEBSITE"; phone=(P 1)}
if ((-not $r2.Ok) -and $r2.Status -eq 409 -and ($r2.Message -like "*$expected*")) {
    Pass "TEST2 exact duplicate create 409"
} else {
    Fail "TEST2 exact duplicate create 409" "status=$($r2.Status) msg=$($r2.Message)"
}

# TEST 3
$withSpaces = " " + (P 2) + " "
$r3 = New-Lead $admin @{firstName="Uniq"; lastName="C"; company="UniqCo"; source="WEBSITE"; phone=$withSpaces}
$lead1Id = $null
$lead2Id = $null
if ($r1.Ok) { $lead1Id = $r1.Lead.id }
if ($r3.Ok) {
    Pass "TEST3 create with surrounding spaces"
    $lead2Id = $r3.Lead.id
} else {
    Fail "TEST3 create with surrounding spaces" "status=$($r3.Status) msg=$($r3.Message)"
}

# TEST 4
$r4 = New-Lead $admin @{firstName="Uniq"; lastName="D"; company="UniqCo"; source="WEBSITE"; phone=(P 2)}
if ((-not $r4.Ok) -and $r4.Status -eq 409 -and ($r4.Message -like "*$expected*")) {
    Pass "TEST4 whitespace-normalized duplicate 409"
} else {
    Fail "TEST4 whitespace-normalized duplicate 409" "status=$($r4.Status) msg=$($r4.Message)"
}

# TEST 5
if ($lead1Id) {
    $r5 = Update-Lead $admin $lead1Id @{phone=(P 1); company="UniqCoEdited"}
    if ($r5.Ok -and $r5.Lead.phone -eq (P 1)) {
        Pass "TEST5 edit keeps same phone (exclude self)"
    } else {
        Fail "TEST5 edit keeps same phone" "status=$($r5.Status) msg=$($r5.Message)"
    }
} else {
    Fail "TEST5 edit keeps same phone" "no lead from TEST1"
}

# TEST 6
if ($lead2Id) {
    $r6 = Update-Lead $admin $lead2Id @{phone=(P 1); company="UniqCo"}
    if ((-not $r6.Ok) -and $r6.Status -eq 409 -and ($r6.Message -like "*$expected*")) {
        Pass "TEST6 edit to other phone 409"
    } else {
        Fail "TEST6 edit to other phone 409" "status=$($r6.Status) msg=$($r6.Message)"
    }
} else {
    Fail "TEST6 edit to other phone 409" "no lead from TEST3"
}

# TEST 7 tenant isolation
$sa = Login "superadmin@dctcrm.com" "password123"
$r7 = New-Lead $sa @{firstName="Other"; lastName="Tenant"; company="OtherCo"; source="WEBSITE"; phone=(P 1)}
if ($r7.Ok -and $r7.Lead.id) {
    Pass "TEST7 same phone other tenant allowed"
} else {
    Fail "TEST7 same phone other tenant allowed" "status=$($r7.Status) msg=$($r7.Message)"
}

# TEST 8 concurrent
$phone = P 9
$jobs = @()
$jobs += Start-Job -ScriptBlock {
    param($base, $phone)
    try {
        $login = Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"admin@dctcrm.com","password":"password123"}'
        $tok = $login.data.token
        $body = @{firstName="Race"; lastName="One"; company="RaceCo"; source="WEBSITE"; phone=$phone} | ConvertTo-Json
        Invoke-RestMethod -Uri "$base/api/leads" -Method POST -ContentType "application/json" -Body $body -Headers @{Authorization="Bearer $tok"} -ErrorAction Stop | Out-Null
        return "201"
    } catch {
        if ($_.Exception -and $_.Exception.Response) {
            try { return ([int]$_.Exception.Response.StatusCode).ToString() } catch { return "ERR" }
        }
        if ($_.ErrorDetails -and $_.ErrorDetails.Message -match "already exists") { return "409" }
        if ($_.ErrorDetails -and $_.ErrorDetails.Message -match "required") { return "400" }
        return "ERR"
    }
} -ArgumentList $baseUrl, $phone
$jobs += Start-Job -ScriptBlock {
    param($base, $phone)
    try {
        $login = Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"admin@dctcrm.com","password":"password123"}'
        $tok = $login.data.token
        $body = @{firstName="Race"; lastName="Two"; company="RaceCo"; source="WEBSITE"; phone=$phone} | ConvertTo-Json
        Invoke-RestMethod -Uri "$base/api/leads" -Method POST -ContentType "application/json" -Body $body -Headers @{Authorization="Bearer $tok"} -ErrorAction Stop | Out-Null
        return "201"
    } catch {
        if ($_.Exception -and $_.Exception.Response) {
            try { return ([int]$_.Exception.Response.StatusCode).ToString() } catch { return "ERR" }
        }
        if ($_.ErrorDetails -and $_.ErrorDetails.Message -match "already exists") { return "409" }
        if ($_.ErrorDetails -and $_.ErrorDetails.Message -match "required") { return "400" }
        return "ERR"
    }
} -ArgumentList $baseUrl, $phone
$outcomes = @($jobs | Wait-Job | Receive-Job)
$jobs | Remove-Job -Force
$okCount = @($outcomes | Where-Object { $_ -eq "201" }).Count
$conflictCount = @($outcomes | Where-Object { $_ -eq "409" }).Count
Log "  Concurrent outcomes: $($outcomes -join ', ')" "Gray"
if ($okCount -eq 1 -and $conflictCount -ge 1) { Pass "TEST8 concurrent create one success one conflict" }
else { Fail "TEST8 concurrent create one success one conflict" "ok=$okCount conflict=$conflictCount outcomes=$($outcomes -join ',')" }

# TEST 9 admin no bypass
$r9 = New-Lead $admin @{firstName="Admin"; lastName="Bypass"; company="BypassCo"; source="WEBSITE"; phone=(P 1)}
if ((-not $r9.Ok) -and $r9.Status -eq 409 -and ($r9.Message -like "*$expected*")) {
    Pass "TEST9 admin no bypass 409"
} else {
    Fail "TEST9 admin no bypass 409" "status=$($r9.Status) msg=$($r9.Message)"
}

# TEST 10 required
$r10 = New-Lead $admin @{firstName="No"; lastName="Phone"; company="NPCo"; source="WEBSITE"}
if ((-not $r10.Ok) -and $r10.Status -eq 400 -and ($r10.Message -like "*Phone number is required*")) {
    Pass "TEST10 missing phone rejected 400"
} else {
    Fail "TEST10 missing phone rejected" "status=$($r10.Status) msg=$($r10.Message)"
}

Log "`n========================================" "Cyan"
Log "RESULTS" "Cyan"
$passed = @($results | Where-Object { $_.Result -eq "PASS" }).Count
$failed = @($results | Where-Object { $_.Result -eq "FAIL" }).Count
Log "Total: $($results.Count) | Passed: $passed | Failed: $failed" "White"
$results | Format-Table -AutoSize
if ($failed -gt 0) { exit 1 }
exit 0
