#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to kill process on a specific port
kill_port() {
    PORT=$1
    if command -v lsof > /dev/null 2>&1; then
        if lsof -ti:$PORT > /dev/null 2>&1; then
            echo -e "${YELLOW}Killing process on port $PORT...${NC}"
            lsof -ti:$PORT | xargs kill -9 2>/dev/null
        fi
    elif command -v netstat > /dev/null 2>&1; then
        # Windows/Git Bash alternative
        PID=$(netstat -ano | grep ":$PORT" | grep LISTENING | awk '{print $5}' | head -1)
        if [ ! -z "$PID" ]; then
            echo -e "${YELLOW}Killing process on port $PORT (PID: $PID)...${NC}"
            kill -9 $PID 2>/dev/null || taskkill //F //PID $PID 2>/dev/null
        fi
    fi
}

# Check if Python is installed
if ! command -v python3 > /dev/null 2>&1 && ! command -v python > /dev/null 2>&1; then
    echo -e "${RED}Error: Python is not installed or not in PATH${NC}"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node > /dev/null 2>&1; then
    echo -e "${RED}Error: Node.js is not installed or not in PATH${NC}"
    exit 1
fi

# Check if npm is installed
if ! command -v npm > /dev/null 2>&1; then
    echo -e "${RED}Error: npm is not installed or not in PATH${NC}"
    exit 1
fi

# Use python3 if available, otherwise python
PYTHON_CMD="python3"
if ! command -v python3 > /dev/null 2>&1; then
    PYTHON_CMD="python"
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Starting VelvetQueue${NC}"
echo -e "${GREEN}========================================${NC}"

# Stop any existing processes
echo -e "${YELLOW}Stopping any existing processes...${NC}"
kill_port 3000
kill_port 8000
sleep 1

# Check if backend dependencies are installed
if [ ! -f "backend/requirements.txt" ]; then
    echo -e "${RED}Error: backend/requirements.txt not found${NC}"
    exit 1
fi

# Check if frontend dependencies are installed
if [ ! -d "frontend/node_modules" ]; then
    echo -e "${YELLOW}Frontend dependencies not found. Installing...${NC}"
    cd frontend
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}Error: Failed to install frontend dependencies${NC}"
        exit 1
    fi
    cd ..
fi

# Start Backend
echo -e "${GREEN}Starting Backend server...${NC}"
cd backend

# Check if virtual environment exists, create if not
if [ ! -d "venv" ] && [ ! -d ".venv" ]; then
    echo -e "${YELLOW}Creating Python virtual environment...${NC}"
    $PYTHON_CMD -m venv venv
fi

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null
elif [ -d ".venv" ]; then
    source .venv/bin/activate 2>/dev/null || source .venv/Scripts/activate 2>/dev/null
fi

# Install backend dependencies if needed
if ! $PYTHON_CMD -c "import fastapi" 2>/dev/null; then
    echo -e "${YELLOW}Installing backend dependencies...${NC}"
    pip install -r requirements.txt
    if [ $? -ne 0 ]; then
        echo -e "${RED}Error: Failed to install backend dependencies${NC}"
        exit 1
    fi
fi

# Start backend in background
$PYTHON_CMD -m uvicorn app.main:app --reload --port 8000 > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 2

# Check if backend started successfully
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${RED}Error: Backend failed to start. Check backend.log for details.${NC}"
    exit 1
fi

# Start Frontend
echo -e "${GREEN}Starting Frontend server...${NC}"
cd frontend
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Wait a moment for frontend to start
sleep 2

# Check if frontend started successfully
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${RED}Error: Frontend failed to start. Check frontend.log for details.${NC}"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Services Started Successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Frontend:${NC} http://localhost:3000 (PID: $FRONTEND_PID)"
echo -e "${GREEN}Backend:${NC}  http://localhost:8000 (PID: $BACKEND_PID)"
echo -e "${GREEN}API Docs:${NC} http://localhost:8000/docs"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop both services${NC}"
echo -e "${YELLOW}Logs: backend.log and frontend.log${NC}"
echo ""

# Function to handle script termination
cleanup() {
    echo ""
    echo -e "${YELLOW}Stopping services...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    sleep 1
    kill_port 3000
    kill_port 8000
    echo -e "${GREEN}Services stopped.${NC}"
    exit 0
}

# Trap SIGINT (Ctrl+C) and SIGTERM to run cleanup
trap cleanup SIGINT SIGTERM

# Wait for both processes to keep the script running
# Also tail the logs
tail -f backend.log frontend.log 2>/dev/null &
TAIL_PID=$!

# Wait for processes
wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
cleanup
