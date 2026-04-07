$body = Get-Content -Path "C:\Users\Agam\Desktop\מעקב קרנות\fund-tracker\data\green\funds.json" -Raw -Encoding UTF8
$headers = @{
    "Content-Type" = "application/json"
    "x-admin-password" = "super2026"
}
$result = Invoke-RestMethod -Uri "https://fund-tracker-bren242s-projects.vercel.app/api/funds?action=import&client=green" -Method PUT -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
Write-Output ($result | ConvertTo-Json)
