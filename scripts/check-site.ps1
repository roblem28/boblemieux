# Site restructure check. Usage: .\scripts\check-site.ps1 -Base https://boblemieux.ai
# Pass = "Failures: 0". Works in Windows PowerShell 5.1 and PowerShell 7.
param([string]$Base = "https://boblemieux.ai")
$Base = $Base.TrimEnd("/")
$ok = @("/", "/work/", "/controls-ai/", "/maps-data/", "/play/", "/blog/", "/blog/post-four/",
        "/projects/marley1/", "/projects/weather/", "/projects/fec/", "/projects/spending/", "/projects/nyt/",
        "/projects/emberwatch/", "/work/integra/", "/work/harvard-brain-science/",
        "/games/planetcraft/", "/games/solar-savers/", "/games/blue-ridge-backroad/", "/games/lightwalker/",
        "/games/obstacleboy/", "/wire/", "/toon/", "/interview/", "/tires/")
$moved = [ordered]@{ "/info"="/work/"; "/projects"="/"; "/work-projects"="/controls-ai/"; "/tech-projects"="/";
            "/all-projects"="/"; "/projects/boblemieux-ai"="/projects/marley1/"; "/blog/post-two"="/blog/";
            "/blog/post-three"="/blog/"; "/blog/post-five"="/blog/"; "/blog/post-six"="/blog/"; "/blog/post-seven"="/blog/" }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
function Get-Head([string]$url) {
  $req = [System.Net.HttpWebRequest]::Create($url); $req.Method = "HEAD"; $req.AllowAutoRedirect = $false
  try { $res = $req.GetResponse() } catch [System.Net.WebException] { $res = $_.Exception.Response }
  if ($null -eq $res) { return @(0, "") }
  $out = @([int]$res.StatusCode, [string]$res.Headers["Location"]); $res.Close(); return $out
}
$fail = 0
foreach ($p in $ok) {
  $r = Get-Head "$Base$p"
  if ($r[0] -eq 200) { $s = "PASS" } else { $s = "FAIL"; $fail++ }
  "{0}  {1}  {2}" -f $s, $r[0], $p
}
foreach ($k in $moved.Keys) {
  $r = Get-Head "$Base$k"
  $loc = if ($r[1]) { ([uri]::new([uri]"$Base/", $r[1])).AbsolutePath } else { "" }
  if ($r[0] -eq 301 -and $loc -eq $moved[$k]) { $s = "PASS" } else { $s = "FAIL"; $fail++ }
  "{0}  {1}  {2} -> {3}" -f $s, $r[0], $k, $loc
}
"`nFailures: $fail"
