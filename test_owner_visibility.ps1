$baseUrl = "http://localhost:3001"
$results = @()
$phoneSeed = (Get-Date -Format "yyMMddHHmmss") + ((Get-Random -Maximum 999).ToString().PadLeft(3, "0"))
function New-TestPhone([int]$n) { return "+91-9$phoneSeed" + $n.ToString().PadLeft(3, "0") }
$script:userPhoneSeq = 200

function Log($msg, $color = "White") { Write-Host $msg -ForegroundColor $color }
function Pass($area) { $script:results += [PSCustomObject]@{ Area=$area; Result="PASS" }; Log "  PASS: $area" "Green" }
function Fail($area, $detail) { $script:results += [PSCustomObject]@{ Area=$area; Result="FAIL" }; Log "  FAIL: $area - $detail" "Red" }

function Login($email, $pass) {
    $r = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body "{`"email`":`"$email`",`"password`":`"$pass`"}" -SessionVariable session -ErrorAction Stop
    return @{ data=$r.data; session=$session; user=$r.data.user; profile=$r.data.profile; token=$r.data.token }
}
function Headers($token) { return @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } }
function HGet($token, $url) {
    try { return Invoke-RestMethod -Uri "$baseUrl$url" -Headers (Headers $token) } catch { return $null }
}
function HGetRaw($token, $url) {
    try { Invoke-RestMethod -Uri "$baseUrl$url" -Headers (Headers $token) -ErrorAction Stop; return @{ ok=$true } }
    catch {
        $status = $null
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        $msg = ""
        try { $stream = $_.Exception.Response.GetResponseStream(); $reader = New-Object System.IO.StreamReader($stream); $msg = $reader.ReadToEnd() } catch {}
        return @{ ok=$false; status=$status; body=$msg }
    }
}
function HPost($token, $url, $body) {
    return Invoke-RestMethod -Uri "$baseUrl$url" -Method POST -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) -Headers (Headers $token)
}
function HPostRaw($token, $url, $raw) {
    return Invoke-RestMethod -Uri "$baseUrl$url" -Method POST -ContentType "application/json" -Body $raw -Headers (Headers $token)
}
function HPatch($token, $url, $body) {
    return Invoke-RestMethod -Uri "$baseUrl$url" -Method PATCH -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) -Headers (Headers $token)
}
function HPut($token, $url, $body) {
    return Invoke-RestMethod -Uri "$baseUrl$url" -Method PUT -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) -Headers (Headers $token)
}
function ShouldFail($token, $method, $url, $body, $name) {
    try {
        $h = Headers $token
        if ($method -eq "POST") { Invoke-RestMethod -Uri "$baseUrl$url" -Method POST -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) -Headers $h -ErrorAction Stop | Out-Null }
        elseif ($method -eq "PATCH") { Invoke-RestMethod -Uri "$baseUrl$url" -Method PATCH -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) -Headers $h -ErrorAction Stop | Out-Null }
        elseif ($method -eq "PUT") { Invoke-RestMethod -Uri "$baseUrl$url" -Method PUT -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) -Headers $h -ErrorAction Stop | Out-Null }
        Fail $name "Expected rejection"
    } catch {
        $status = 0
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        if ($status -ge 400 -and $status -lt 500) { Pass $name } else { Fail $name "status=$status" }
    }
}
function ShouldFailRaw($token, $method, $url, $raw, $name) {
    try {
        $h = Headers $token
        if ($method -eq "POST") { Invoke-RestMethod -Uri "$baseUrl$url" -Method POST -ContentType "application/json" -Body $raw -Headers $h -ErrorAction Stop | Out-Null }
        elseif ($method -eq "PATCH") { Invoke-RestMethod -Uri "$baseUrl$url" -Method PATCH -ContentType "application/json" -Body $raw -Headers $h -ErrorAction Stop | Out-Null }
        elseif ($method -eq "PUT") { Invoke-RestMethod -Uri "$baseUrl$url" -Method PUT -ContentType "application/json" -Body $raw -Headers $h -ErrorAction Stop | Out-Null }
        Fail $name "Expected rejection"
    } catch {
        $status = 0
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        if ($status -ge 400 -and $status -lt 500) { Pass $name } else { Fail $name "status=$status" }
    }
}

Log "`n=== OWNER VISIBILITY + SITE VISIT WORKFLOW E2E ===" "Cyan"

# Setup sessions
$admin = Login "admin@dctcrm.com" "password123"
$adminTok = $admin.token
Log "Admin logged in" "Yellow"

# Profiles
$profiles = HGet $adminTok "/api/profiles?limit=50"
$profileMap = @{}
foreach ($p in $profiles.data) { $profileMap[$p.name.ToLower()] = $p.id }
Log "Profiles: $($profileMap.Keys -join ', ')" "Gray"

# Ensure test users exist
$testUsers = @(
    @{ email="owner.vis.a@test.com"; first="OwnerA"; last="Vis"; profileKey="sales executive" },
    @{ email="owner.vis.b@test.com"; first="OwnerB"; last="Vis"; profileKey="sales executive" },
    @{ email="svc.share.a@test.com"; first="SvcA"; last="Share"; profileKey="svc" },
    @{ email="svc.share.b@test.com"; first="SvcB"; last="Share"; profileKey="svc" },
    @{ email="svc.share.c@test.com"; first="SvcC"; last="Share"; profileKey="svc" }
)
$userIds = @{}
foreach ($tu in $testUsers) {
    $existing = HGet $adminTok "/api/users?search=$([uri]::EscapeDataString($tu.email))&limit=5"
    $found = $null
    if ($existing -and $existing.data) {
        $found = $existing.data | Where-Object { $_.email -eq $tu.email } | Select-Object -First 1
    }
    $script:userPhoneSeq++
    if (-not $found) {
        $profId = $profileMap[$tu.profileKey]
        if (-not $profId) { $profId = $profileMap["sales"] }
        try {
            $created = HPost $adminTok "/api/users" @{
                email=$tu.email
                firstName=$tu.first
                lastName=$tu.last
                phone=(New-TestPhone $script:userPhoneSeq)
                password="password123"
                profileId=$profId
                roleIds=@()
            }
            $userIds[$tu.email] = $created.data.id
            Log "Created user $($tu.email)" "Gray"
        } catch {
            Log "Create user failed for $($tu.email): $($_.Exception.Message)" "Red"
            $existing2 = HGet $adminTok "/api/users?search=$([uri]::EscapeDataString($tu.email))&limit=5"
            $found2 = $null
            if ($existing2 -and $existing2.data) {
                $found2 = $existing2.data | Where-Object { $_.email -eq $tu.email } | Select-Object -First 1
            }
            if ($found2) {
                $userIds[$tu.email] = $found2.id
                HPut $adminTok "/api/users/$($found2.id)/password" @{ password="password123" } | Out-Null
                Log "Reset password for existing $($tu.email)" "Gray"
            } else { throw }
        }
    } else {
        $userIds[$tu.email] = $found.id
        Log "User exists $($tu.email)" "Gray"
        # Correct profile if the user was created with a different profile in an earlier run
        $profId = $profileMap[$tu.profileKey]
        if ($profId -and $found.profile.id -ne $profId) {
            HPut $adminTok "/api/users/$($found.id)" @{ profileId=$profId } | Out-Null
            Log "Updated profile for $($tu.email) -> $($tu.profileKey)" "Gray"
        }
        try { Login $tu.email "password123" | Out-Null }
        catch {
            HPut $adminTok "/api/users/$($found.id)/password" @{ password="password123" } | Out-Null
            Log "Reset password for $($tu.email)" "Gray"
        }
    }
}

# Login all test users
$a = Login "owner.vis.a@test.com" "password123"
$b = Login "owner.vis.b@test.com" "password123"
$svcA = Login "svc.share.a@test.com" "password123"
$svcB = Login "svc.share.b@test.com" "password123"
$svcC = Login "svc.share.c@test.com" "password123"
Log "Test users logged in" "Yellow"

# ============================================
# 1. SAME-PROFILE OWNER ISOLATION
# ============================================
Log "`n=== SAME-PROFILE OWNER ISOLATION ===" "Cyan"

# Create leads as Admin (documented contract: only Admin/Presales may POST /api/leads;
# ownerId is not client-settable), then assign ownership via PATCH /api/leads/:id/owner
$leadsA = @()
for ($i = 1; $i -le 5; $i++) {
    $l = HPost $adminTok "/api/leads" @{
        firstName="LeadA$i"; lastName="Owner"; company="ACorp$i"; source="WEBSITE"
        phone=(New-TestPhone (10 + $i))
    }
    HPatch $adminTok "/api/leads/$($l.data.id)/owner" @{ ownerId=$a.user.id; reason="E2E owner isolation setup" } | Out-Null
    $leadsA += (HGet $adminTok "/api/leads/$($l.data.id)").data
}
Pass "5 leads created and assigned to A"

# Create 3 leads as Admin assigned to B
$leadsB = @()
for ($i = 1; $i -le 3; $i++) {
    $l = HPost $adminTok "/api/leads" @{
        firstName="LeadB$i"; lastName="Owner"; company="BCorp$i"; source="WEBSITE"
        phone=(New-TestPhone (20 + $i))
    }
    HPatch $adminTok "/api/leads/$($l.data.id)/owner" @{ ownerId=$b.user.id; reason="E2E owner isolation setup" } | Out-Null
    $leadsB += (HGet $adminTok "/api/leads/$($l.data.id)").data
}
Pass "3 leads created and assigned to B"

# A's list should include A's leads, not B's
$listA = HGet $a.token "/api/leads?limit=100"
$idsA = @($listA.data | ForEach-Object { $_.id })
$missingA = $leadsA | Where-Object { $idsA -notcontains $_.id }
if ($missingA.Count -eq 0) { Pass "A sees own leads in list" } else { Fail "A list" "Missing $($missingA.Count) own leads" }
$leakedA = $leadsB | Where-Object { $idsA -contains $_.id }
if ($leakedA.Count -eq 0) { Pass "A does not see B's leads in list" } else { Fail "A isolation" "Leaked $($leakedA.Count) B leads" }

# B's list
$listB = HGet $b.token "/api/leads?limit=100"
$idsB = @($listB.data | ForEach-Object { $_.id })
$leakedB = $leadsA | Where-Object { $idsB -contains $_.id }
if ($leakedB.Count -eq 0) { Pass "B does not see A's leads in list" } else { Fail "B isolation" "Leaked $($leakedB.Count) A leads" }

# Direct URL: A tries B's lead -> 403/404
$direct = HGetRaw $a.token "/api/leads/$($leadsB[0].id)"
if (-not $direct.ok -and $direct.status -in 403,404) { Pass "A denied direct GET of B's lead (status $($direct.status))" }
elseif ($direct.ok) { Fail "A direct access" "Got 200" }
else { Fail "A direct access" "status=$($direct.status)" }

# Direct URL: B tries A's lead
$direct2 = HGetRaw $b.token "/api/leads/$($leadsA[0].id)"
if (-not $direct2.ok -and $direct2.status -in 403,404) { Pass "B denied direct GET of A's lead (status $($direct2.status))" }
elseif ($direct2.ok) { Fail "B direct access" "Got 200" }
else { Fail "B direct access" "status=$($direct2.status)" }

# Search: A searching B's lead number should not find it
$searchB = HGet $a.token "/api/leads?search=$($leadsB[0].leadNumber)"
$foundB = @($searchB.data | Where-Object { $_.id -eq $leadsB[0].id })
if ($foundB.Count -eq 0) { Pass "Search does not leak B's lead to A" } else { Fail "Search isolation" "Found B's lead" }

# Search own lead number
$searchA = HGet $a.token "/api/leads?search=$($leadsA[0].leadNumber)"
$foundA = @($searchA.data | Where-Object { $_.id -eq $leadsA[0].id })
if ($foundA.Count -ge 1) { Pass "Search finds own lead" } else { Fail "Search own" "Not found" }

# ============================================
# 2. SITE VISIT WORKFLOW SHARING
# ============================================
Log "`n=== SITE VISIT WORKFLOW SHARING ===" "Cyan"

# Get a project for scheduling
$projects = HGet $adminTok "/api/projects?limit=1"
$projectId = $null
if ($projects -and $projects.data -and $projects.data.Count -gt 0) { $projectId = $projects.data[0].id }
if (-not $projectId) {
    # create one as admin
    $pr = HPost $adminTok "/api/projects" @{ name="E2E Test Project $(Get-Date -Format yyyyMMddHHmmss)"; description="E2E" }
    $projectId = $pr.data.id
}
Log "Project: $projectId" "Gray"

# Move lead A1 to PROSPECT via status then schedule SV as admin/A
$leadSv = $leadsA[0]
# A: NEW -> INCOMING
HPut $a.token "/api/leads/$($leadSv.id)/status" @{ status="INCOMING"; note="Customer interested" } | Out-Null
# Push to SVC
$pushed = HPost $a.token "/api/leads/$($leadSv.id)/push-to-svc" @{ reason="Qualified for site visit" }
Pass "Lead pushed to SVC (status=$($pushed.data.status))"

# Schedule site visit as A (now PROSPECT owner after round robin? might be SVC)
# Use admin to schedule with explicit assignee = svcA
$scheduledAt = (Get-Date).ToUniversalTime().AddDays(2).ToString("yyyy-MM-ddTHH:mm:ss.000Z")
$svCreate = $null
try {
    $svCreate = HPost $adminTok "/api/site-visits" @{
        leadId=$leadSv.id
        projectId=$projectId
        assigneeId=$userIds["svc.share.a@test.com"]
        scheduledAt=$scheduledAt
        notes="E2E site visit"
        status="SCHEDULED"
    }
    Pass "Site visit created (SCHEDULED)"
} catch {
    Fail "Site visit create" $_.Exception.Message
}
if (-not $svCreate) {
    # Fallback: schedule via lead endpoint
    $svCreate = HPost $a.token "/api/leads/$($leadSv.id)/schedule-site-visit" @{
        scheduledAt=$scheduledAt
        notes="E2E site visit via lead"
        projectId=$projectId
    }
    Pass "Site visit created via lead schedule endpoint"
}

$svId = $svCreate.data.id
if (-not $svId -and $svCreate.data.siteVisit) { $svId = $svCreate.data.siteVisit.id }
Log "SV id: $svId" "Gray"

# Lead status should be SITE_VISIT_SCHEDULED
$leadAfterSv = HGet $adminTok "/api/leads/$($leadSv.id)"
if ($leadAfterSv.data.status -eq "SITE_VISIT_SCHEDULED") { Pass "Lead status SITE_VISIT_SCHEDULED" }
else { Fail "Lead status after SV" "Got $($leadAfterSv.data.status)" }

# SVC A (assignee) can access lead while SCHEDULED
$svcALead = HGetRaw $svcA.token "/api/leads/$($leadSv.id)"
if ($svcALead.ok) { Pass "Assigned SVC A can access lead while SV SCHEDULED" }
else { Fail "SVC A access" "status=$($svcALead.status)" }

# SVC B (not assigned) cannot access lead
$svcBLead = HGetRaw $svcB.token "/api/leads/$($leadSv.id)"
if (-not $svcBLead.ok -and $svcBLead.status -in 403,404) { Pass "Unassigned SVC B denied lead access (status $($svcBLead.status))" }
elseif ($svcBLead.ok) { Fail "SVC B isolation" "Got 200" }
else { Fail "SVC B isolation" "status=$($svcBLead.status)" }

# SVC C denied
$svcCLead = HGetRaw $svcC.token "/api/leads/$($leadSv.id)"
if (-not $svcCLead.ok -and $svcCLead.status -in 403,404) { Pass "Unassigned SVC C denied lead access" }
else { Fail "SVC C isolation" "ok=$($svcCLead.ok)" }

# SVC A sees SV in list
$svListA = HGet $svcA.token "/api/site-visits?limit=100"
$svIdsA = @($svListA.data | ForEach-Object { $_.id })
if ($svIdsA -contains $svId) { Pass "SVC A sees assigned site visit in list" } else { Fail "SVC A SV list" "Not found" }

# SVC B does not see SV
$svListB = HGet $svcB.token "/api/site-visits?limit=100"
$svIdsB = @($svListB.data | ForEach-Object { $_.id })
if ($svIdsB -notcontains $svId) { Pass "SVC B does not see unassigned site visit" } else { Fail "SVC B SV list" "Leaked" }

# SVC B direct GET SV denied
$svDirectB = HGetRaw $svcB.token "/api/site-visits/$svId"
if (-not $svDirectB.ok -and $svDirectB.status -in 403,404) { Pass "SVC B denied direct SV access" }
elseif ($svDirectB.ok) { Fail "SVC B SV direct" "Got 200" }
else { Fail "SVC B SV direct" "status=$($svDirectB.status)" }

# ============================================
# 3. INVALID TRANSITIONS
# ============================================
Log "`n=== INVALID SITE VISIT TRANSITIONS ===" "Cyan"

# Cancel without reason
ShouldFail $admin.token "PATCH" "/api/site-visits/$svId/cancel" @{ reason="   " } "Cancel with whitespace reason rejected"
ShouldFail $admin.token "PATCH" "/api/site-visits/$svId/cancel" @{} "Cancel without reason rejected"

# Revisit without required fields
ShouldFail $admin.token "POST" "/api/site-visits/$svId/revisit" @{ reason="Need revisit" } "Revisit missing scheduledAt/project rejected"
ShouldFail $admin.token "POST" "/api/site-visits/$svId/revisit" @{ reason="   "; scheduledAt=$scheduledAt; projectId=$projectId } "Revisit whitespace reason rejected"

# ============================================
# 4. REVISIT
# ============================================
Log "`n=== REVISIT ===" "Cyan"
$revisitAt = (Get-Date).ToUniversalTime().AddDays(4).ToString("yyyy-MM-ddTHH:mm:ss.000Z")
try {
    $rev = HPost $admin.token "/api/site-visits/$svId/revisit" @{
        reason="Client requested another visit"
        scheduledAt=$revisitAt
        projectId=$projectId
        notes="Revisit notes"
    }
    if ($rev.data.id -and $rev.data.status -eq "SCHEDULED") { Pass "Revisit created with status SCHEDULED" }
    else { Fail "Revisit status" "Got $($rev.data.status)" }
    if ($rev.data.previousSiteVisitId -eq $svId -or $rev.data.previousSiteVisit) { Pass "Revisit linked to previousSiteVisit" }
    else { Fail "Revisit link" "previousSiteVisitId missing" }
    $revId = $rev.data.id
} catch {
    Fail "Revisit create" $_.Exception.Message
    $revId = $null
}

# Original SV remains SCHEDULED (or whatever it was)
$svAfterRev = HGet $admin.token "/api/site-visits/$svId"
if ($svAfterRev.data.status -eq "SCHEDULED") { Pass "Original SV still SCHEDULED after revisit" }
else { Fail "Original SV after revisit" "status=$($svAfterRev.data.status)" }

# Lead still SITE_VISIT_SCHEDULED
$leadAfterRev = HGet $admin.token "/api/leads/$($leadSv.id)"
if ($leadAfterRev.data.status -eq "SITE_VISIT_SCHEDULED") { Pass "Lead still SITE_VISIT_SCHEDULED after revisit" }
else { Fail "Lead after revisit" "status=$($leadAfterRev.data.status)" }

# ============================================
# 5. COMPLETE SITE VISIT
# ============================================
Log "`n=== COMPLETE SITE VISIT ===" "Cyan"

# Invalid: complete already completed / wrong id
ShouldFail $admin.token "PATCH" "/api/site-visits/does-not-exist/complete" @{} "Complete non-existent rejected"

try {
    $comp = HPatch $admin.token "/api/site-visits/$svId/complete" @{ completedAt=(Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.000Z"); customerFeedback="Client happy"; completionNotes="Done" }
    if ($comp.data.status -eq "COMPLETED") { Pass "Site visit completed (COMPLETED)" }
    else { Fail "Complete status" "Got $($comp.data.status)" }
} catch {
    Fail "Complete SV" $_.Exception.Message
}

# Lead becomes SITE_VISIT_HAPPENED
$leadAfterComp = HGet $admin.token "/api/leads/$($leadSv.id)"
if ($leadAfterComp.data.status -eq "SITE_VISIT_HAPPENED") { Pass "Lead status SITE_VISIT_HAPPENED after complete" }
else { Fail "Lead after complete" "status=$($leadAfterComp.data.status)" }

# SVC A sharing should be GONE after COMPLETE (no active SCHEDULED SV for A if this was the only one)
# Note: revisit created a second SCHEDULED SV still assigned to A — so access may remain.
# Test with SVC C who was never assigned: still denied.
$svcCAfter = HGetRaw $svcC.token "/api/leads/$($leadSv.id)"
if (-not $svcCAfter.ok) { Pass "SVC C still denied after complete" }
else { Fail "SVC C after complete" "Got 200" }

# Complete already completed -> reject
ShouldFail $admin.token "PATCH" "/api/site-visits/$svId/complete" @{} "Complete already-completed rejected"

# ============================================
# 6. CANCEL SITE VISIT
# ============================================
Log "`n=== CANCEL SITE VISIT ===" "Cyan"

# Cancel revisit SV
if ($revId) {
    # Lead needs to be SITE_VISIT_SCHEDULED for cancel to move it to PROSPECT — lead is currently SITE_VISIT_HAPPENED
    # Cancel should still work on SCHEDULED SV regardless
    try {
        $canc = HPatch $admin.token "/api/site-visits/$revId/cancel" @{ reason="Client cancelled revisit" }
        if ($canc.data.status -eq "CANCELLED") { Pass "Revisit SV cancelled (CANCELLED)" }
        else { Fail "Cancel status" "Got $($canc.data.status)" }
    } catch {
        Fail "Cancel SV" $_.Exception.Message
    }

    # After cancel, no active SCHEDULED SV for A (original is COMPLETED, revisit CANCELLED)
    $svcAAfterCancel = HGetRaw $svcA.token "/api/leads/$($leadSv.id)"
    # Access may remain if lead is SITE_VISIT_HAPPENED and A somehow owns it — check owner
    Log "SVC A after cancel ok=$($svcAAfterCancel.ok) status=$($svcAAfterCancel.status)" "Gray"

    # If lead was SITE_VISIT_SCHEDULED, cancel would move to PROSPECT.
    # Here lead is SITE_VISIT_HAPPENED so should stay.
    $leadAfterCancel = HGet $admin.token "/api/leads/$($leadSv.id)"
    if ($leadAfterCancel.data.status -eq "SITE_VISIT_HAPPENED") { Pass "Lead remains SITE_VISIT_HAPPENED after cancel (was not SCHEDULED)" }
    else { Fail "Lead after cancel" "status=$($leadAfterCancel.data.status)" }
}

# Test cancel moves lead SITE_VISIT_SCHEDULED -> PROSPECT
$leadSv2 = $leadsA[1]
HPut $a.token "/api/leads/$($leadSv2.id)/status" @{ status="INCOMING"; note="Interested" } | Out-Null
HPost $a.token "/api/leads/$($leadSv2.id)/push-to-svc" @{ reason="Qualified" } | Out-Null
$scheduledAt2 = (Get-Date).ToUniversalTime().AddDays(3).ToString("yyyy-MM-ddTHH:mm:ss.000Z")
$sv2 = HPost $admin.token "/api/site-visits" @{
    leadId=$leadSv2.id
    projectId=$projectId
    assigneeId=$userIds["svc.share.b@test.com"]
    scheduledAt=$scheduledAt2
    notes="SV2"
    status="SCHEDULED"
}
$sv2Id = $sv2.data.id
$leadSv2Check = HGet $admin.token "/api/leads/$($leadSv2.id)"
if ($leadSv2Check.data.status -eq "SITE_VISIT_SCHEDULED") { Pass "Lead2 SITE_VISIT_SCHEDULED" }
else { Fail "Lead2 status" "Got $($leadSv2Check.data.status)" }

# SVC B can access during SCHEDULED
$svcBDuring = HGetRaw $svcB.token "/api/leads/$($leadSv2.id)"
if ($svcBDuring.ok) { Pass "SVC B can access lead2 while assigned SCHEDULED" }
else { Fail "SVC B during" "status=$($svcBDuring.status)" }

# Cancel lead2 SV -> lead to PROSPECT
try {
    HPatch $admin.token "/api/site-visits/$sv2Id/cancel" @{ reason="No longer interested" } | Out-Null
    $leadSv2After = HGet $admin.token "/api/leads/$($leadSv2.id)"
    if ($leadSv2After.data.status -eq "PROSPECT") { Pass "Cancel moves lead SITE_VISIT_SCHEDULED -> PROSPECT" }
    else { Fail "Cancel lead transition" "Got $($leadSv2After.data.status)" }
} catch {
    Fail "Cancel lead2 SV" $_.Exception.Message
}

# Sharing gone after CANCEL for SVC B
$svcBAfter = HGetRaw $svcB.token "/api/leads/$($leadSv2.id)"
if (-not $svcBAfter.ok) { Pass "SVC B sharing lost after CANCEL" }
else {
    # might still own if round robin assigned B as owner
    $leadOwner = HGet $admin.token "/api/leads/$($leadSv2.id)"
    if ($leadOwner.data.owner.id -eq $userIds["svc.share.b@test.com"]) { Pass "SVC B still has access as owner (round robin)" }
    else { Fail "SVC B sharing after cancel" "ok without ownership" }
}

# ============================================
# 7. LEAD BUTTON MATRIX / WORKFLOW RULES
# ============================================
Log "`n=== WORKFLOW RULES ===" "Cyan"

# Move to recovery only NEW/INCOMING (Admin exercises NEW path; SE exercises INCOMING path)
$leadRec = $leadsA[2]
try {
    $rec = HPost $admin.token "/api/leads/$($leadRec.id)/move-to-recovery" @{ recoveryReason="Customer not responding" }
    if ($rec.data) { Pass "Move to recovery from NEW allowed" } else { Fail "Recovery NEW" "No data" }
} catch {
    Fail "Recovery from NEW" $_.Exception.Message
}

# Push to SVC only from INCOMING
$leadPush = $leadsA[3]
ShouldFail $a.token "POST" "/api/leads/$($leadPush.id)/push-to-svc" @{ reason="Too early" } "Push to SVC from NEW rejected"
# Make INCOMING then push works (Sales Executive allowed after workflow fix)
HPut $a.token "/api/leads/$($leadPush.id)/status" @{ status="INCOMING"; note="Ready" } | Out-Null
try {
    HPost $a.token "/api/leads/$($leadPush.id)/push-to-svc" @{ reason="Qualified" } | Out-Null
    Pass "Push to SVC from INCOMING allowed"
} catch { Fail "Push from INCOMING" $_.Exception.Message }

# Schedule site visit only from PROSPECT
$leadSched = $leadsA[4]
ShouldFail $a.token "POST" "/api/leads/$($leadSched.id)/schedule-site-visit" @{ scheduledAt=$scheduledAt; notes="Too early"; projectId=$projectId } "Schedule SV from NEW rejected"

# ============================================
# 8. REPORT OWNER SCOPE
# ============================================
Log "`n=== REPORT OWNER SCOPE ===" "Cyan"
try {
    $report = HPost $a.token "/api/reports/run" @{
        objectName="Lead"
        showMe="all"
        columns=@("id","lastName","status","ownerId")
        filters=@()
    }
    # If user has OWNER scope, backend should force mine regardless of showMe=all
    $allOwned = $true
    foreach ($row in $report.data.rows) {
        if ($row.ownerId -and $row.ownerId -ne $a.user.id) { $allOwned = $false }
    }
    if ($allOwned) { Pass "Report forces OWNER scope (showMe=all ignored)" }
    else { Fail "Report scope" "Foreign owners present" }
} catch {
    Fail "Report run" $_.Exception.Message
}

# ============================================
# 9. SEARCH SCOPE
# ============================================
Log "`n=== SEARCH SCOPE ===" "Cyan"
$globalSearch = HGet $a.token "/api/search?q=LeadB"
$leaked = @()
if ($globalSearch -and $globalSearch.data) {
    foreach ($item in @($globalSearch.data)) {
        $itemStr = $item | ConvertTo-Json -Depth 5 -Compress
        foreach ($bl in $leadsB) {
            if ($itemStr -like "*$($bl.id)*" -or $itemStr -like "*$($bl.leadNumber)*") { $leaked += $bl.id }
        }
    }
}
if ($leaked.Count -eq 0) { Pass "Global search does not leak B's leads to A" }
else { Fail "Search leak" "$($leaked.Count) leaked" }

# ============================================
# 10. TENANT ISOLATION
# ============================================
Log "`n=== TENANT ISOLATION ===" "Cyan"
$sa = Login "superadmin@dctcrm.com" "password123"
$saLeads = HGet $sa.token "/api/leads?limit=1"
if ($saLeads.pagination.total -gt 0) { Pass "Superadmin sees leads (cross-tenant OK for SA)" }
else { Fail "Superadmin leads" "Empty" }

# ============================================
# RESULTS
# ============================================
Log "`n========================================" "Cyan"
Log "OWNER VISIBILITY / SV WORKFLOW RESULTS" "Cyan"
Log "========================================" "Cyan"
$passed = ($results | Where-Object { $_.Result -eq "PASS" }).Count
$failed = ($results | Where-Object { $_.Result -eq "FAIL" }).Count
Log "Total: $($results.Count) | Passed: $passed | Failed: $failed" "White"
Log "" "White"
$results | Format-Table -AutoSize
if ($failed -gt 0) { exit 1 } else { exit 0 }
