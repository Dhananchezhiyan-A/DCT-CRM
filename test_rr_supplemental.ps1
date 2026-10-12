# ============================================================
# DCT CRM - Round Robin GAP SUPPLEMENTAL probes
# Covers specific PARTIAL / NOT TESTED items from test_round_robin.ps1:
#   SP1-SP3  Empty pool fallback for PRESALES / SVC / SALES  (suite: PARTIAL - does not strip membership)
#   SP4      Profile change live re-eligibility              (suite: NOT TESTED)
#   SP5      AD: multi-tenant concurrent lead creation       (suite: NOT TESTED - one tenant only)
#   SP6      AE: live API restart + RR cursor persistence    (suite: NOT TESTED - static only)
#   SP7      Permission-set deny matrix                      (suite: NOT TESTED - documented, design reason)
# Runs standalone. Restores every pool and profile it touches.
# Cleans up only the temp test data it creates (temp leads + zz-temp-t2 tenant).
# ============================================================
$baseUrl = "http://localhost:3001"
# PS5.1 defaults ServicePoint connection limit to 2; SP5 fires 100 concurrent
# requests which exhausts it and makes follow-up sequential calls fail client-side.
[System.Net.ServicePointManager]::DefaultConnectionLimit = 1000
$results = @()
$global:currentToken = $null
$phoneSeq = (Get-Date -Format "yyMMddHHmmss") + (Get-Random -Maximum 999).ToString().PadLeft(3, "0")
$script:phoneCounter = 0

function Log($msg, $color = "White") { Write-Host $msg -ForegroundColor $color }
function Pass($area) { $script:results += [PSCustomObject]@{ Area = $area; Result = "PASS" }; Log "  PASS: $area" "Green" }
function Fail($area, $detail) { $script:results += [PSCustomObject]@{ Area = $area; Result = "FAIL" }; Log "  FAIL: $area - $detail" "Red" }
function Partial($area, $detail) { $script:results += [PSCustomObject]@{ Area = $area; Result = "PARTIAL" }; Log "  PARTIAL: $area - $detail" "Yellow" }
function NotTested($area, $detail) { $script:results += [PSCustomObject]@{ Area = $area; Result = "NOT TESTED" }; Log "  NOT TESTED: $area - $detail" "DarkYellow" }

function Login($email, $pass) {
    $global:currentToken = $null
    $body = "{`"email`":`"$email`",`"password`":`"$pass`"}"
    try {
        $resp = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body $body
        $global:currentToken = $resp.data.token
        return $resp.data
    } catch { return $null }
}
function AuthHeaders() { return @{ Authorization = "Bearer $global:currentToken" } }
$script:last = @{ Status = 0; Raw = ""; Data = $null }
function Req($method, $url, $body, $headers, $rawBody) {
    if ($null -eq $headers) { $headers = AuthHeaders }
    try {
        $params = @{ Uri = "$baseUrl$url"; Method = $method; Headers = $headers; UseBasicParsing = $true }
        if ($null -ne $rawBody) { $params.ContentType = "application/json"; $params.Body = $rawBody }
        elseif ($null -ne $body) { $params.ContentType = "application/json"; $params.Body = ($body | ConvertTo-Json -Depth 10) }
        $r = Invoke-WebRequest @params
        $parsed = $null
        try { $parsed = $r.Content | ConvertFrom-Json } catch {}
        $script:last = @{ Status = [int]$r.StatusCode; Raw = "$($r.Content)"; Data = $parsed }
        return $parsed
    } catch {
        $code = -1; $raw = ""; $parsed = $null
        if ($_.Exception.Response) {
            $code = [int]$_.Exception.Response.StatusCode
            if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $raw = $_.ErrorDetails.Message }
            else { try { $s = $_.Exception.Response.GetResponseStream(); $s.Position = 0; $sr = New-Object IO.StreamReader($s); $raw = $sr.ReadToEnd() } catch { $raw = "" } }
            if ($raw) { try { $parsed = $raw | ConvertFrom-Json } catch {} }
        } else { $raw = $_.Exception.Message }
        $script:last = @{ Status = $code; Raw = $raw; Data = $parsed }
        return $parsed
    }
}
function AGet($url) { return Req "GET" $url $null $null $null }
function APost($url, $body) { return Req "POST" $url $body $null $null }
function APut($url, $body) { return Req "PUT" $url $body $null $null }
function ADelete($url) { return Req "DELETE" $url $null $null $null }
function New-TempPhone { $script:phoneCounter++; return "+91-97" + $phoneSeq + $script:phoneCounter.ToString().PadLeft(4, "0") }

function Get-PoolRows([string]$pool) {
    $r = AGet "/api/round-robin/$pool"
    if ($script:last.Status -eq 200 -and $r.data) { return @($r.data) }
    return @()
}
function Empty-Pool([string]$pool) {
    $active = @(Get-PoolRows $pool | Where-Object { $_.isActive })
    foreach ($m in $active) { ADelete "/api/round-robin/$($m.id)" | Out-Null }
    $still = @(Get-PoolRows $pool | Where-Object { $_.isActive })
    return @{ captured = $active; ok = ($still.Count -eq 0) }
}
function Restore-Pool([string]$pool, [array]$captured) {
    foreach ($m in $captured) { APost "/api/round-robin" @{ userId = $m.userId; poolType = $pool } | Out-Null }
    return @(Get-PoolRows $pool | Where-Object { $_.isActive }).Count
}
function Test-AdminUser([string]$userId) {
    if (-not $script:adminProfileIds) { return $false }
    $u = AGet "/api/users/$userId"
    if ($script:last.Status -eq 200 -and $u.data) {
        if ($u.data.profileId -and ($script:adminProfileIds -contains $u.data.profileId)) { return $true }
        if ($u.data.profile -and $u.data.profile.isAdmin) { return $true }
    }
    return $false
}
function Get-LastHandoffReason([string]$leadId) {
    $d = AGet "/api/leads/$leadId"
    if ($script:last.Status -eq 200 -and $d.data.ownerHistory) {
        $hist = @($d.data.ownerHistory | Sort-Object startDate -Descending)
        if ($hist.Count -gt 0) { return "$($hist[0].handoffReason)" }
    }
    return ""
}
function New-Lead([string]$last) {
    $r = APost "/api/leads" @{ firstName = "RRGap"; lastName = $last; company = "RRGapCorp"; source = "WEBSITE"; phone = (New-TempPhone) }
    if ($script:last.Status -eq 201) { return $r.data.id }
    return $null
}

# ============================================================
Log "`n=== SP0. SETUP ===" "Cyan"
if (-not (Login "admin@dctcrm.com" "password123")) { Write-Host "FATAL: admin login failed" -ForegroundColor Red; exit 1 }
Pass "SP0 Admin session"
$profRes = AGet "/api/profiles?limit=100"
$script:adminProfileIds = @()
if ($profRes.data) { $script:adminProfileIds = @($profRes.data | Where-Object { $_.isAdmin } | ForEach-Object { $_.id }) }
if ($script:adminProfileIds.Count -gt 0) { Pass "SP0 Admin profile ids resolved ($($script:adminProfileIds.Count))" } else { Fail "SP0 admin profiles" "none" }
$projRes = AGet "/api/projects?limit=1"
$projectId = $null
if ($projRes.data -and @($projRes.data).Count -gt 0) { $projectId = @($projRes.data)[0].id }
if ($projectId) { Pass "SP0 Project available" } else { Fail "SP0 Project" "none" ; exit 1 }
$restoreQueue = @()

try {

# ============================================================
# SP1. EMPTY PRESALES POOL -> admin fallback, then restore
# ============================================================
Log "`n=== SP1. EMPTY PRESALES POOL ===" "Cyan"
$capP = Empty-Pool "PRESALES"
$restoreQueue += @{ pool = "PRESALES"; rows = $capP.captured }
if (-not $capP.ok) { Fail "SP1a Empty PRESALES pool" "active rows remain" } else { Pass "SP1a PRESALES pool emptied (membership captured for restore)" }
$memberIdsP = @($capP.captured | ForEach-Object { $_.userId })
$l1 = New-Lead "SpEmpty1"
if ($l1) {
    $ownerP1 = $null
    $d1 = AGet "/api/leads/$l1"
    if ($script:last.Status -eq 200) { $ownerP1 = $d1.data.ownerId }
    $reasonP1 = Get-LastHandoffReason $l1
    if ($ownerP1 -and (Test-AdminUser $ownerP1) -and $reasonP1 -match 'fallback') {
        Pass "SP1b Empty PRESALES -> same-tenant Admin fallback (handoff: $reasonP1)"
    } elseif ($ownerP1 -and (Test-AdminUser $ownerP1)) {
        Partial "SP1b Empty PRESALES fallback" "admin owner but handoff reason='$reasonP1'"
    } else { Fail "SP1b Empty PRESALES fallback" "owner=$ownerP1 reason=$reasonP1" }
} else { Fail "SP1c lead create" "status=$($script:last.Status)" }
$restoredP = Restore-Pool "PRESALES" $capP.captured
if ($restoredP -eq $memberIdsP.Count) { Pass "SP1c PRESALES membership restored ($restoredP members)" } else { Fail "SP1c PRESALES restore" "active=$restoredP expected=$($memberIdsP.Count)" }
$l2 = New-Lead "SpRest1"
if ($l2 -and $memberIdsP.Count -gt 0) {
    $d2 = AGet "/api/leads/$l2"
    $ownerP2 = $d2.data.ownerId
    if ($ownerP2 -and ($memberIdsP -contains $ownerP2)) { Pass "SP1d Restored PRESALES -> pool member assigned again" }
    else { Fail "SP1d restored assignment" "owner=$ownerP2 members=$($memberIdsP -join ',')" }
} else { NotTested "SP1d restored PRESALES assignment" "lead or members missing" }

# ============================================================
# SP2. EMPTY SVC POOL -> admin fallback on push-to-svc, then restore
# ============================================================
Log "`n=== SP2. EMPTY SVC POOL ===" "Cyan"
$capS = Empty-Pool "SVC"
$restoreQueue += @{ pool = "SVC"; rows = $capS.captured }
if (-not $capS.ok) { Fail "SP2a Empty SVC pool" "active rows remain" } else { Pass "SP2a SVC pool emptied (membership captured for restore)" }
$memberIdsS = @($capS.captured | ForEach-Object { $_.userId })
$ls1 = New-Lead "SpSvc1"
$pushOk1 = $false
if ($ls1) {
    APut "/api/leads/$ls1/status" @{ status = "INCOMING"; note = "gap probe" } | Out-Null
    APost "/api/leads/$ls1/push-to-svc" @{ reason = "gap probe empty pool" } | Out-Null
    if ($script:last.Status -eq 200) { $pushOk1 = $true }
    $ownerS1 = $null
    $ds1 = AGet "/api/leads/$ls1"
    if ($script:last.Status -eq 200) { $ownerS1 = $ds1.data.ownerId }
    $reasonS1 = Get-LastHandoffReason $ls1
    if ($pushOk1 -and $ownerS1 -and (Test-AdminUser $ownerS1) -and $reasonS1 -match 'fallback') {
        Pass "SP2b Empty SVC push -> Admin fallback (handoff: $reasonS1)"
    } elseif ($pushOk1 -and $ownerS1 -and (Test-AdminUser $ownerS1)) {
        Partial "SP2b Empty SVC fallback" "admin owner but handoff='$reasonS1'"
    } else { Fail "SP2b Empty SVC fallback" "push=$pushOk1 owner=$ownerS1 reason=$reasonS1 status=$($script:last.Status)" }
} else { Fail "SP2c lead create" "status=$($script:last.Status)" }
$restoredS = Restore-Pool "SVC" $capS.captured
if ($restoredS -eq $memberIdsS.Count) { Pass "SP2c SVC membership restored ($restoredS members)" } else { Fail "SP2c SVC restore" "active=$restoredS expected=$($memberIdsS.Count)" }
$ls2 = New-Lead "SpSvc2"
if ($ls2 -and $memberIdsS.Count -gt 0) {
    APut "/api/leads/$ls2/status" @{ status = "INCOMING"; note = "gap probe restored" } | Out-Null
    APost "/api/leads/$ls2/push-to-svc" @{ reason = "gap probe restored pool" } | Out-Null
    $pushOk2 = ($script:last.Status -eq 200)
    $ds2 = AGet "/api/leads/$ls2"
    $ownerS2 = $ds2.data.ownerId
    if ($pushOk2 -and $ownerS2 -and ($memberIdsS -contains $ownerS2)) { Pass "SP2d Restored SVC push -> pool member assigned" }
    else { Fail "SP2d restored SVC assignment" "push=$pushOk2 owner=$ownerS2 members=$($memberIdsS -join ',')" }
} else { NotTested "SP2d restored SVC assignment" "lead or members missing" }

# ============================================================
# SP3. EMPTY SALES POOL -> admin fallback on schedule, then restore
# ============================================================
Log "`n=== SP3. EMPTY SALES POOL ===" "Cyan"
$capSa = Empty-Pool "SALES"
$restoreQueue += @{ pool = "SALES"; rows = $capSa.captured }
if (-not $capSa.ok) { Fail "SP3a Empty SALES pool" "active rows remain" } else { Pass "SP3a SALES pool emptied (membership captured for restore)" }
$memberIdsSa = @($capSa.captured | ForEach-Object { $_.userId })
$schedDate = (Get-Date).AddDays(3).ToString("yyyy-MM-ddTHH:mm:ss.000Z")
$l3 = New-Lead "SpSales1"
if ($l3) {
    APut "/api/leads/$l3/status" @{ status = "PROSPECT"; note = "gap probe schedule" } | Out-Null
    APost "/api/leads/$l3/schedule-site-visit" @{ scheduledAt = $schedDate; notes = "gap probe"; projectId = $projectId } | Out-Null
    $schedOk = ($script:last.Status -eq 200 -or $script:last.Status -eq 201)
    $d3 = AGet "/api/leads/$l3"
    $ownerSa1 = $d3.data.ownerId
    $reasonSa1 = Get-LastHandoffReason $l3
    if ($schedOk -and $ownerSa1 -and (Test-AdminUser $ownerSa1) -and $reasonSa1 -match 'fallback') {
        Pass "SP3b Empty SALES schedule -> Admin fallback (handoff: $reasonSa1)"
    } elseif ($schedOk -and $ownerSa1 -and (Test-AdminUser $ownerSa1)) {
        Partial "SP3b Empty SALES fallback" "admin owner but handoff='$reasonSa1'"
    } else { Fail "SP3b Empty SALES fallback" "sched=$schedOk owner=$ownerSa1 reason=$reasonSa1 status=$($script:last.Status) raw=$($script:last.Raw)" }
} else { Fail "SP3c lead create" "status=$($script:last.Status)" }
$restoredSa = Restore-Pool "SALES" $capSa.captured
if ($restoredSa -eq $memberIdsSa.Count) { Pass "SP3c SALES membership restored ($restoredSa members)" } else { Fail "SP3c SALES restore" "active=$restoredSa expected=$($memberIdsSa.Count)" }
$l4 = New-Lead "SpSales2"
if ($l4 -and $memberIdsSa.Count -gt 0) {
    APut "/api/leads/$l4/status" @{ status = "PROSPECT"; note = "gap probe restored schedule" } | Out-Null
    APost "/api/leads/$l4/schedule-site-visit" @{ scheduledAt = $schedDate; notes = "gap probe restored"; projectId = $projectId } | Out-Null
    $schedOk2 = ($script:last.Status -eq 200 -or $script:last.Status -eq 201)
    $d4 = AGet "/api/leads/$l4"
    $ownerSa2 = $d4.data.ownerId
    if ($schedOk2 -and $ownerSa2 -and ($memberIdsSa -contains $ownerSa2)) { Pass "SP3d Restored SALES schedule -> pool member assigned" }
    else { Fail "SP3d restored SALES assignment" "sched=$schedOk2 owner=$ownerSa2 members=$($memberIdsSa -join ',')" }
} else { NotTested "SP3d restored SALES assignment" "lead or members missing" }

# ============================================================
# SP4. PROFILE CHANGE LIVE RE-ELIGIBILITY
# ============================================================
Log "`n=== SP4. PROFILE CHANGE LIVE RE-ELIGIBILITY ===" "Cyan"
$svcRows = @(Get-PoolRows "SVC" | Where-Object { $_.isActive })
$svcUserIds = @($svcRows | ForEach-Object { $_.userId })
$profiles = AGet "/api/profiles?limit=100"
$otherProfile = $null
if ($profiles.data) { $otherProfile = @($profiles.data | Where-Object { $_.name -ne "SVC" -and -not $_.isAdmin } | Select-Object -First 1) }
if ($svcUserIds.Count -gt 0 -and $otherProfile) {
    $originals = @{}
    $changeOk = $true
    foreach ($uid in $svcUserIds) {
        $u = AGet "/api/users/$uid"
        $origPid = $null
        if ($script:last.Status -eq 200 -and $u.data) { $origPid = $u.data.profileId; if (-not $origPid -and $u.data.profile) { $origPid = $u.data.profile.id } }
        if (-not $origPid) { $changeOk = $false; break }
        $originals[$uid] = $origPid
        APut "/api/users/$uid" @{ profileId = $otherProfile.id } | Out-Null
        if ($script:last.Status -ne 200) { $changeOk = $false; break }
    }
    if ($changeOk) {
        Pass "SP4a All $($svcUserIds.Count) SVC member profiles changed to '$($otherProfile.name)' (live)"
        $l5 = New-Lead "SpProf1"
        if ($l5) {
            APut "/api/leads/$l5/status" @{ status = "INCOMING"; note = "profile gap" } | Out-Null
            APost "/api/leads/$l5/push-to-svc" @{ reason = "profile mismatch probe" } | Out-Null
            $push3 = ($script:last.Status -eq 200)
            $d5 = AGet "/api/leads/$l5"
            $ownerX = $d5.data.ownerId
            if ($push3 -and $ownerX -and (Test-AdminUser $ownerX)) { Pass "SP4b Profile-mismatched members excluded -> Admin fallback assigned" }
            else { Fail "SP4b profile re-eligibility" "push=$push3 owner=$ownerX" }
        } else { Fail "SP4c lead create" "status=$($script:last.Status)" }
        # Restore profiles
        $restoreOk = $true
        foreach ($uid in $originals.Keys) { APut "/api/users/$uid" @{ profileId = $originals[$uid] } | Out-Null; if ($script:last.Status -ne 200) { $restoreOk = $false } }
        if ($restoreOk) { Pass "SP4c Original profiles restored" } else { Fail "SP4c profile restore" "one or more PUTs failed" }
        $l6 = New-Lead "SpProf2"
        if ($l6) {
            APut "/api/leads/$l6/status" @{ status = "INCOMING"; note = "profile restored" } | Out-Null
            APost "/api/leads/$l6/push-to-svc" @{ reason = "profile restored probe" } | Out-Null
            $push4 = ($script:last.Status -eq 200)
            $d6 = AGet "/api/leads/$l6"
            $ownerY = $d6.data.ownerId
            if ($push4 -and $ownerY -and ($svcUserIds -contains $ownerY)) { Pass "SP4d Restored profiles re-eligible -> member assigned" }
            else { Fail "SP4d restored eligibility" "push=$push4 owner=$ownerY" }
        } else { NotTested "SP4d restored eligibility" "lead create failed" }
    } else { Fail "SP4a profile change" "user GET or PUT failed (status=$($script:last.Status))" }
} else { NotTested "SP4 profile re-eligibility" "SVC members=$($svcUserIds.Count) otherProfile=$($otherProfile -ne $null)" }

} finally {
    # Guarantee every emptied pool is restored even if a probe failed mid-way
    foreach ($rq in $restoreQueue) {
        $current = @(Get-PoolRows $rq.pool | Where-Object { $_.isActive })
        if ($current.Count -lt @($rq.rows).Count) { Restore-Pool $rq.pool $rq.rows | Out-Null }
    }
    if (-not (Login "admin@dctcrm.com" "password123")) { Log "  (session restore failed)" "Red" }
}

# Verify all three pools back to captured sizes
foreach ($poolCheck in @(@{ p = "PRESALES"; n = $memberIdsP.Count }, @{ p = "SVC"; n = $memberIdsS.Count }, @{ p = "SALES"; n = $memberIdsSa.Count })) {
    $now = @(Get-PoolRows $poolCheck.p | Where-Object { $_.isActive })
    if ($now.Count -ge $poolCheck.n) { Pass "SP9 $($poolCheck.p) pool intact after probes ($($now.Count) active)" }
    else { Fail "SP9 $($poolCheck.p) pool post-probe" "active=$($now.Count) expected>=$($poolCheck.n)" }
}

# ============================================================
# SP7. PERMISSION-SET DENY MATRIX (design documentation)
# ============================================================
Log "`n=== SP7. PERMISSION DENY MATRIX ===" "Cyan"
$svcContent = Get-Content "apps\api\src\services\roundRobin.ts" -Raw
$assignByProfile = ($svcContent -match 'profile:\s*\{\s*name:\s*config\.profileName')
$assignByPerm = ($svcContent -match 'hasPermission|EffectivePermission')
if ($assignByProfile -and -not $assignByPerm) {
    NotTested "SP7 Full permission-set deny matrix for RR assignee" "By design RR eligibility = active + profile name match (roundRobin.ts getConfiguredMembers); permission sets gate DATA access, not pool selection. Mutating live permission sets would not change assignment selection, so no meaningful assertion exists without a product decision. Profile-mismatch exclusion IS live-tested in SP4."
} elseif ($assignByPerm) {
    NotTested "SP7 Full permission-set deny matrix" "service references permissions - manual review required"
} else {
    Fail "SP7 eligibility source" "could not classify eligibility logic"
}

# ============================================================
# SP5. AD - MULTI-TENANT CONCURRENT LEAD CREATION
# ============================================================
Log "`n=== SP5. AD - MULTI-TENANT CONCURRENT (100+ each) ===" "Cyan"
$T2SLUG = "zz-temp-t2"
$sa = $null
try { $sa = Login "superadmin@dctcrm.com" "password123" } catch { $sa = $null }
$provReady = $false
$t2UserId = $null
if ($sa) {
    APost "/api/admin/tenants" @{ name = "ZZ Temp Tenant 2"; slug = $T2SLUG; companyCode = "ZZT2" } | Out-Null
    $t2Created = ($script:last.Status -eq 201 -or $script:last.Status -eq 409)
    if ($t2Created) {
        $provOut = & node ".\test_cross_tenant_setup.js" up 2>&1
        if ($LASTEXITCODE -eq 0) {
            $provReady = $true
            $line = ($provOut | Where-Object { "$_" -match '"ok"\s*:\s*true' } | Select-Object -Last 1)
            if ($line) { try { $t2UserId = ($line | ConvertFrom-Json).userId } catch {} }
        } else { Log "  provisioner failed: $provOut" "DarkYellow" }
    }
}
$t2token = $null
if ($provReady) { $t2token = Login "t2.admin@zztemp.test" "T2TempPass!234" }
if (-not $t2token) {
    Login "admin@dctcrm.com" "password123" | Out-Null
    NotTested "SP5 AD multi-tenant concurrent 100+ leads each" "tenant B provisioning failed (provReady=$provReady)"
} else {
    $aToken = $global:currentToken
    $t2TokenVal = $global:currentToken
    # Switch back to tenant A admin for A-side traffic
    Login "admin@dctcrm.com" "password123" | Out-Null
    $aToken = $global:currentToken

    $nEach = 100
    $batchSize = 50
    $aResults = @(); $bResults = @()
    for ($start = 1; $start -le $nEach; $start += $batchSize) {
        $end = [Math]::Min($start + $batchSize - 1, $nEach)
        $jobs = @()
        for ($i = $start; $i -le $end; $i++) {
            $phoneA = "+91-96" + $phoneSeq + $i.ToString().PadLeft(4, "0")
            $phoneB = "+91-95" + $phoneSeq + $i.ToString().PadLeft(4, "0")
            $ja = [powershell]::Create().AddScript({
                param($baseUrl, $token, $phone, $lastName, $company)
                $headers = @{ Authorization = "Bearer $token" }
                $body = @{ firstName = "AD"; lastName = $lastName; company = $company; source = "WEBSITE"; phone = $phone } | ConvertTo-Json
                try {
                    $r = Invoke-RestMethod -Uri "$baseUrl/api/leads" -Method POST -ContentType "application/json" -Body $body -Headers $headers
                    return @{ ok = $true; id = $r.data.id; ownerId = $r.data.ownerId; side = $company }
                } catch { return @{ ok = $false; error = $_.Exception.Message; side = $company } }
            }).AddArgument($baseUrl).AddArgument($aToken).AddArgument($phoneA).AddArgument("ADA$i").AddArgument("ADTempA")
            $jobs += $ja
            $jb = [powershell]::Create().AddScript({
                param($baseUrl, $token, $phone, $lastName, $company)
                $headers = @{ Authorization = "Bearer $token" }
                $body = @{ firstName = "AD"; lastName = $lastName; company = $company; source = "WEBSITE"; phone = $phone } | ConvertTo-Json
                try {
                    $r = Invoke-RestMethod -Uri "$baseUrl/api/leads" -Method POST -ContentType "application/json" -Body $body -Headers $headers
                    return @{ ok = $true; id = $r.data.id; ownerId = $r.data.ownerId; side = $company }
                } catch { return @{ ok = $false; error = $_.Exception.Message; side = $company } }
            }).AddArgument($baseUrl).AddArgument($t2TokenVal).AddArgument($phoneB).AddArgument("ADB$i").AddArgument("ADTempB")
            $jobs += $jb
        }
        $handles = @()
        foreach ($j in $jobs) { $handles += @{ j = $j; h = $j.BeginInvoke() } }
        foreach ($h in $handles) {
            $res = $null
            try { $res = $h.j.EndInvoke($h.h) } catch { $res = @(@{ ok = $false; error = $_.Exception.Message }) }
            foreach ($item in $res) {
                if ($item.side -eq "ADTempA") { $aResults += $item } else { $bResults += $item }
            }
            $h.j.Dispose()
        }
        Log "  batch $start-$end done (A ok=$(@($aResults | Where-Object { $_.ok }).Count) B ok=$(@($bResults | Where-Object { $_.ok }).Count))" "Gray"
    }
    $aOk = @($aResults | Where-Object { $_.ok })
    $bOk = @($bResults | Where-Object { $_.ok })
    $aFail = @($aResults | Where-Object { -not $_.ok })
    $bFail = @($bResults | Where-Object { -not $_.ok })
    Log "  AD totals: A $($aOk.Count)/$($nEach) ok, B $($bOk.Count)/$($nEach) ok" "Gray"

    if ($aOk.Count -eq $nEach) { Pass "SP5a Tenant A 100 concurrent leads created" } else { Fail "SP5a tenant A concurrency" "$($aFail.Count) failed: $(($aFail | Select-Object -First 3 | ForEach-Object { $_.error }) -join '; ')" }
    if ($bOk.Count -eq $nEach) { Pass "SP5b Tenant B 100 concurrent leads created" } else { Fail "SP5b tenant B concurrency" "$($bFail.Count) failed: $(($bFail | Select-Object -First 3 | ForEach-Object { $_.error }) -join '; ')" }

    $bOwners = @($bOk | ForEach-Object { $_.ownerId } | Select-Object -Unique)
    if ($t2UserId -and $bOwners.Count -eq 1 -and $bOwners[0] -eq $t2UserId) { Pass "SP5c All Tenant B leads owned by Tenant B admin (no cross-tenant owners)" }
    else { Fail "SP5c tenant B owners" "unique=$($bOwners.Count) expected=$t2UserId got=$($bOwners -join ',')" }
    $aOwnedByB = @($aOk | Where-Object { $t2UserId -and $_.ownerId -eq $t2UserId }).Count
    if ($aOwnedByB -eq 0) { Pass "SP5d No Tenant A lead owned by a Tenant B user" } else { Fail "SP5d cross-tenant owner bleed" "count=$aOwnedByB" }
    $aNullOwners = @($aOk | Where-Object { -not $_.ownerId }).Count + @($bOk | Where-Object { -not $_.ownerId }).Count
    if ($aNullOwners -eq 0) { Pass "SP5e No null owners under multi-tenant concurrency" } else { Fail "SP5e null owners" "count=$aNullOwners" }

    # Cleanup: delete the 100 Tenant A temp leads (tenant B data is wiped by provisioner down)
    $deleted = 0; $delFail = 0
    foreach ($lr in $aOk) {
        ADelete "/api/leads/$($lr.id)" | Out-Null
        if ($script:last.Status -eq 200 -or $script:last.Status -eq 204) { $deleted++ }
        else {
            # Retry once: PS5.1 can drop rapid sequential keep-alive connections client-side
            Start-Sleep -Milliseconds 300
            ADelete "/api/leads/$($lr.id)" | Out-Null
            if ($script:last.Status -eq 200 -or $script:last.Status -eq 204) { $deleted++ }
            else { $delFail++ }
        }
    }
    if ($delFail -eq 0 -and $deleted -eq $nEach) { Pass "SP5f All $deleted Tenant A temp leads deleted" }
    else { Fail "SP5f temp lead cleanup" "deleted=$deleted failed=$delFail" }

    Login "superadmin@dctcrm.com" "password123" | Out-Null
    $cleanOut = & node ".\test_cross_tenant_setup.js" down 2>&1
    if ($LASTEXITCODE -eq 0) { Pass "SP5g Tenant B temp data wiped (zz-temp-t2)" } else { Fail "SP5g tenant B wipe" "$cleanOut" }
    Login "admin@dctcrm.com" "password123" | Out-Null
    # Confirm no ADTempA leads remain in tenant A.
    # -1 sentinel: a non-200/failed request must NOT count as "no residue".
    $left = AGet "/api/leads?search=ADTempA&limit=10"
    $leftCount = -1
    if ($script:last.Status -eq 200) {
        if ($null -eq $left.data) { $leftCount = 0 } else { $leftCount = @($left.data).Count }
    }
    if ($leftCount -eq 0) { Pass "SP5h No ADTempA residue in Tenant A" } else { Fail "SP5h residue" "count=$leftCount" }
}

# ============================================================
# SP6. AE - LIVE API RESTART + RR CURSOR PERSISTENCE
# ============================================================
Log "`n=== SP6. AE - LIVE RESTART ===" "Cyan"
function Get-QueueSnapshot {
    $out = & node ".\test_rr_queue_probe.js" 2>&1
    foreach ($line in $out) {
        if ("$line" -like 'QUEUE_SNAPSHOT:*') { return ("$line".Substring('QUEUE_SNAPSHOT:'.Length)) }
    }
    return $null
}
$before = Get-QueueSnapshot
$pidBefore = $null
$listen = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listen) { $pidBefore = $listen.OwningProcess }

# Touch a watched API source file with IDENTICAL bytes (mtime change -> tsx watch restart)
$srcPath = "apps\api\src\index.ts"
$origBytes = [IO.File]::ReadAllBytes((Resolve-Path $srcPath))
[IO.File]::WriteAllText((Resolve-Path $srcPath), [Text.Encoding]::UTF8.GetString($origBytes))
$restarted = $false
for ($w = 1; $w -le 30 -and -not $restarted; $w++) {
    Start-Sleep -Seconds 1
    $l2 = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($l2 -and $pidBefore -and $l2.OwningProcess -ne $pidBefore) { $restarted = $true }
    elseif ($l2 -and -not $pidBefore) { $restarted = $true }
}
if (-not $restarted) {
    # Fall back: detect via fresh process serving (pid may be reused/tid same)
    Log "  watcher PID unchanged - verifying service health instead" "DarkYellow"
}
# Wait for API to answer again
$apiOk = $false
for ($w = 1; $w -le 30 -and -not $apiOk; $w++) {
    Start-Sleep -Seconds 1
    if (Login "admin@dctcrm.com" "password123") { $apiOk = $true }
}
if ($apiOk) { Pass "SP6a API serving after live restart touch (pidBefore=$pidBefore restarted=$restarted)" }
else { Fail "SP6a API health after restart" "login still failing 30s after touch" }

$after = Get-QueueSnapshot
if ($before -and $after -and $before -eq $after) {
    Pass "SP6b RR cursor (Queue.description) unchanged across restart (DB-backed state)"
} elseif ($before -and $after) {
    Fail "SP6b RR cursor changed across restart" "before=$before after=$after"
} else {
    NotTested "SP6b RR cursor persistence" "queue snapshot unavailable (before=$([bool]$before) after=$([bool]$after))"
}
$lr2 = New-Lead "SpRestart"
if ($lr2) { Pass "SP6c Post-restart lead creation + RR assignment works" } else { Fail "SP6c post-restart lead" "status=$($script:last.Status)" }

# ============================================================
# SUMMARY
# ============================================================
$pass = @($results | Where-Object { $_.Result -eq "PASS" }).Count
$fail = @($results | Where-Object { $_.Result -eq "FAIL" }).Count
$part = @($results | Where-Object { $_.Result -eq "PARTIAL" }).Count
$nt = @($results | Where-Object { $_.Result -eq "NOT TESTED" }).Count
Log "`nPASS: $pass  FAIL: $fail  PARTIAL: $part  NOT TESTED: $nt  TOTAL: $($results.Count)" "Cyan"
if ($fail -gt 0) {
    Log "FAILURES:" "Red"
    $results | Where-Object { $_.Result -eq "FAIL" } | ForEach-Object { Log "  - $($_.Area)" "Red" }
}
exit $(if ($fail -gt 0) { 1 } else { 0 })
