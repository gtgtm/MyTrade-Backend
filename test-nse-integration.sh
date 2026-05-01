#!/bin/bash

# NSE Integration Test Script
# Tests all endpoints with real NSE data

set -e

BASE_URL="http://192.168.1.21:3000"
SYMBOLS=("NIFTY" "BANKNIFTY" "SENSEX")

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}NSE Integration & Real Data Testing${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}\n"

# Function to test endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local description=$3

    echo -e "${YELLOW}Testing: $description${NC}"
    echo -e "  Endpoint: $endpoint"

    if response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint"); then
        http_code=$(echo "$response" | tail -n1)
        body=$(echo "$response" | head -n-1)

        if [ "$http_code" -eq 200 ]; then
            echo -e "  ${GREEN}✅ Status: $http_code${NC}"

            # Extract key data
            symbol=$(echo "$body" | jq -r '.data.symbol // .data[0].symbol // "N/A"' 2>/dev/null)
            price=$(echo "$body" | jq -r '.data.currentPrice // .data.underlying.price // "N/A"' 2>/dev/null)
            pcr=$(echo "$body" | jq -r '.data.pcrAnalysis.pcr // .data.analysis.pcr.ratio // "N/A"' 2>/dev/null)

            echo -e "  Symbol: $symbol"
            echo -e "  Price: $price"
            echo -e "  PCR: $pcr"
            echo ""
            return 0
        else
            echo -e "  ${RED}❌ Status: $http_code${NC}"
            echo -e "  Error: $(echo "$body" | jq -r '.error // "Unknown error"' 2>/dev/null)"
            echo ""
            return 1
        fi
    else
        echo -e "  ${RED}❌ Connection failed${NC}"
        echo ""
        return 1
    fi
}

# Test 1: Health check
echo -e "${BLUE}📋 Test 1: Health Check${NC}"
test_endpoint "GET" "/api/health" "Server health"

# Test 2: Individual symbol tests
echo -e "${BLUE}📋 Test 2: Individual Symbols${NC}"
for symbol in "${SYMBOLS[@]}"; do
    test_endpoint "GET" "/api/option-chain/$symbol" "Option Chain - $symbol"
done

# Test 3: Strikes data
echo -e "${BLUE}📋 Test 3: Strike-by-Strike Greeks${NC}"
test_endpoint "GET" "/api/option-chain/NIFTY/strikes?format=compact" "Strikes Data (Compact) - NIFTY"

# Test 4: Max Pain
echo -e "${BLUE}📋 Test 4: Max Pain Analysis${NC}"
test_endpoint "GET" "/api/option-chain/NIFTY/max-pain" "Max Pain - NIFTY"

# Test 5: PCR Analysis with Signals
echo -e "${BLUE}📋 Test 5: PCR Analysis & Trading Signals${NC}"
test_endpoint "GET" "/api/signals/NIFTY/pcr-analysis" "PCR Analysis - NIFTY"

# Test 6: Critical Alerts
echo -e "${BLUE}📋 Test 6: Critical Alerts${NC}"
test_endpoint "GET" "/api/option-chain/NIFTY/alerts" "Critical Alerts - NIFTY"

# Test 7: Batch Multi-Symbol
echo -e "${BLUE}📋 Test 7: Batch Multi-Symbol Fetch${NC}"
test_endpoint "GET" "/api/option-chain/multi/NIFTY,BANKNIFTY,SENSEX" "Batch Fetch - All 3 Indices"

# Test 8: Data Quality Check
echo -e "${BLUE}📋 Test 8: Data Quality Assessment${NC}"
if response=$(curl -s "$BASE_URL/api/option-chain/NIFTY"); then
    data_quality=$(echo "$response" | jq -r '.data.metadata.dataQuality' 2>/dev/null)
    if [ -n "$data_quality" ]; then
        echo -e "  ${GREEN}✅ Data Quality Metrics${NC}"
        echo "$data_quality" | jq '.' | sed 's/^/  /'
        echo ""
    fi
fi

# Test 9: Greeks Validation
echo -e "${BLUE}📋 Test 9: Greeks Calculation Sample${NC}"
if response=$(curl -s "$BASE_URL/api/option-chain/NIFTY/strikes?format=compact"); then
    first_strike=$(echo "$response" | jq '.data.strikes[0]' 2>/dev/null)
    if [ -n "$first_strike" ] && [ "$first_strike" != "null" ]; then
        echo -e "  ${GREEN}✅ Sample Strike Greeks${NC}"
        echo "$first_strike" | jq '{strike, callDelta: .callDelta, putDelta: .putDelta, callIV: .callIV, putIV: .putIV}' | sed 's/^/  /'
        echo ""
    fi
fi

# Summary
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🎉 All tests completed!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}\n"

echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Verify all ✅ statuses above"
echo "2. Compare Greeks with TradingView (±2% tolerance)"
echo "3. Check Max Pain aligns with market bias"
echo "4. Validate PCR sentiment matches market conditions"
echo "5. Monitor server logs for any errors"
echo ""

echo -e "${YELLOW}Useful Commands:${NC}"
echo "  # Watch real-time updates"
echo "  watch -n 2 'curl -s $BASE_URL/api/signals/NIFTY/pcr-analysis | jq .data.pcrAnalysis'"
echo ""
echo "  # Compare multiple indices"
echo "  for idx in NIFTY BANKNIFTY SENSEX; do"
echo "    echo \$idx: \$(curl -s $BASE_URL/api/option-chain/\$idx | jq -r '.data.underlying.price')"
echo "  done"
echo ""

echo -e "${YELLOW}Documentation:${NC}"
echo "  - NSE_INTEGRATION_GUIDE.md - Complete testing guide"
echo "  - IMPLEMENTATION_GUIDE.md - API endpoint reference"
echo "  - ENHANCEMENTS.md - Original specifications"
echo ""
