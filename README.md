# Ship Route Optimization System
## Getting Started

### Prerequisites

- Node.js 16.x or higher
- OpenWeather API key (for weather data)
- AWS account (for production deployment) with Docker Installed
- GitHub account (for CI/CD setup)
- Docker

### Local Development Setup

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/silly-goose-rising.git
   cd silly-goose-rising
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Create a `.env` file based on the example
   ```bash
   cp example.env .env
   ```

4. Update environment variables in `.env` with your specific configuration
   ```
   PORT=3000
   MONGODB_CONNECTION_URI=mongodb://localhost:27017/ship-route-optimization
   JWT_SECRET=your_jwt_secret_here
   REFRESH_TOKEN_SECRET=your_refresh_token_secret_here
   OPENWEATHER_API_KEY=your_api_key_here
   NODE_ENV=development
   ```

5. Start the development server
   ```bash
   npm run dev
   ```

7. Run tests
   ```bash
   npm test
   ```

8. Run linting
   ```bash
   npm run lint
   ```

## Production Deployment (Docker + GitHub Actions on Ubuntu EC2)

### 1. AWS EC2 Setup

1. **Launch EC2 instance**
   - **OS:** Ubuntu Server 20.04+ recommended
   - **Instance Type:** t3.medium or larger
   - **Security Group Rules:**
     - Allow inbound on:
       - **22** (SSH)
       - **80** (HTTP)
       - **443** (HTTPS)
       - Any other **app-specific ports**

---

### 2. Initial Setup on EC2

SSH into your instance:

```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
```

Run the following:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install -y docker.io
sudo systemctl enable docker
sudo usermod -aG docker $USER  # logout & login after this

# Install Git
sudo apt install -y git
```

---

### 3. Prepare Deployment Directory

```bash
cd ~
git clone ....
cd ....

# Add your environment file
nano production.env
# (Paste contents or let GitHub Actions write it via secret)

# Test initial Docker run (optional)
docker build -t ship-route .
docker run -d --restart=always -p 80:3000 --name shippp --env-file=production.env ship-route
```

---

### 4. Configure GitHub Actions for CI/CD

1. In your GitHub repository:
   - Go to **Settings → Secrets → Actions**
   - Add the following secrets:

| Secret Name      | Value                                        |
|------------------|----------------------------------------------|
| `EC2_HOST`       | Your EC2 IP or domain name                   |
| `EC2_USER`       | `ubuntu`                                     |
| `EC2_SSH_KEY`    | Your **PEM format** private key              |
| `PRODUCTION_ENV` | Full contents of your production.env file    |

2. Create `.github/workflows/deploy.yml` (already discussed)

GitHub Actions will:
- Run lint & test
- SSH into EC2
- Pull latest code
- Rebuild and restart Docker container

---

#### Database Setup

1. MongoDB Atlas (Recommended for production)
   - Create an Atlas account and set up a new cluster
   - Configure network access to allow connections from your EC2 instances
   - Create a database user with appropriate permissions
   - Update your production.env file with the Atlas connection string

### Environment Variables

- `PORT`: Application port (default: 3000)
- `MONGODB_CONNECTION_URI`: MongoDB connection string
- `JWT_SECRET`: Secret for JWT token signing
- `REFRESH_TOKEN_SECRET`: Secret for refresh tokens
- `OPENWEATHER_API_KEY`: API key for OpenWeather
- `NODE_ENV`: Environment (development/production)
- `EMAIL_SERVICE`: Email service for password reset (e.g., 'gmail')
- `EMAIL_USERNAME`: Email account username
- `EMAIL_PASSWORD`: Email account password
- `EMAIL_FROM`: From address for emails
- `FRONTEND_URL`: URL for frontend application (for password reset links)

## System Architecture

The application is built on a Node.js/Express backend with MongoDB for data storage. It uses a WebSocket interface for real-time communication alongside a RESTful API for standard CRUD operations.

### Core Components

1. **Server**: Express application handling HTTP requests and WebSocket connections
2. **WebSocket Service**: Real-time communications for route updates
3. **Route Optimization**: Algorithms for path planning and optimization
4. **Weather Service**: External weather data integration
5. **AI Optimization**: Enhanced route planning using historical data
6. **Authentication**: JWT-based user authentication and authorization
7. **Analytics**: Performance metrics and operational insights

### Data Models

- **Users**: Authentication and access control
- **Ships**: Vessel specifications and characteristics
- **Route History**: Historical and planned route data
- **Fuel Usage**: Consumption tracking and efficiency metrics
- **Maintenance Logs**: Vessel maintenance records

### Technical Stack

- **Backend**: Node.js with Express
- **Database**: MongoDB
- **Real-time**: Socket.IO for WebSockets
- **Geospatial**: Turf.js for geographical calculations
- **Authentication**: JWT tokens
- **Deployment**: AWS EC2 with load balancing
- **CI/CD**: GitHub Actions pipeline

## API Endpoints

### Authentication Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/register` | POST | Register a new user account |
| `/auth/login` | POST | Authenticate user and receive access tokens |
| `/auth/me` | GET | Retrieve current user information |
| `/auth/refresh-token` | POST | Refresh an expired access token |
| `/auth/logout` | POST | Invalidate current refresh token |
| `/auth/forgot-password` | POST | Request password reset email |
| `/auth/reset-password` | POST | Reset password using token |

### Route Planning Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/route-plan` | POST | Create a new optimized route plan |
| `/ships/:shipId/routes` | GET | Retrieve all routes for a specific ship |
| `/routes/:routeId` | GET | Get detailed information for a specific route |
| `/routes/:routeId/status` | PATCH | Update status of an existing route |
| `/route-alternatives` | POST | Generate alternative route options |
| `/routes/:routeId/update-weather` | GET | Update route with latest weather data |
| `/routes/:routeId/complete` | POST | Mark a route as completed with actual metrics |
| `/routes/:routeId/optimal-speed` | GET | Get recommended speed based on conditions |

### Fuel and Maintenance Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/fuel-estimate` | GET | Calculate fuel consumption estimate for a route |
| `/maintenance-schedule` | GET | Generate maintenance schedule for a vessel |
| `/maintenance/schedule` | POST | Schedule new maintenance activity |
| `/analytics` | GET | Retrieve operational analytics and insights |

### WebSocket Events

| Client Event | Description |
|--------------|-------------|
| `join-route` | Join a route planning/monitoring session |
| `request-route-plan` | Request creation of a new route plan |
| `update-position` | Send vessel position update |
| `request-alternatives` | Request alternative route options |
| `select-route` | Choose a proposed route alternative |

| Server Event | Description |
|--------------|-------------|
| `welcome` | Initial connection confirmation |
| `joined-route` | Confirmation of joining a route session |
| `route-plan` | New route plan details |
| `route-update` | Updated route information |
| `route-alternatives` | List of alternative route options |
| `route-selected` | Notification of route selection |
| `error` | Error notification |

## Mathematics and AI in Ship Route Optimization

### Geospatial Algorithms

| Algorithm | Purpose | Implementation |
|-----------|---------|----------------|
| **Haversine Formula** | Calculate great-circle distances | Used in `turf.distance()` for accurate distance calculations between waypoints |
| **Bearing Calculation** | Determine direction between points | Used in `turf.bearing()` for route adjustments around weather |
| **Destination Point** | Find coordinates at distance/bearing | Used in `turf.destination()` to create new waypoints during route deviation |

### Route Optimization Algorithms

| Algorithm | Purpose | Implementation |
|-----------|---------|----------------|
| **Dynamic Waypoint Generation** | Create appropriate waypoint density | `generateBaseRoute()` in `routeOptimizationService.js` |
| **Weather-based Route Deviation** | Avoid adverse weather | `applyWeatherOptimization()` in `routeOptimizationService.js` |
| **Multi-factor Speed Calculation** | Determine optimal speed | `calculateBaseSpeed()` applies weight, distance factors |
| **Position-based Route Recalculation** | Update routes with real position | `updateRouteRealTime()` finds nearest waypoint and recalculates |

### AI and Machine Learning Techniques

| Technique | Purpose | Implementation |
|-----------|---------|----------------|
| **Historical Pattern Recognition** | Learn from past routes | `generateHistoricalLearningRoute()` in `aiOptimizationService.js` |
| **Dynamic-weighted Ensemble** | Combine multiple strategies | `generateHybridRoute()` adjusts weights based on conditions |
| **Multi-criterion Scoring** | Select optimal route | `selectOptimalRoute()` with weighted factor evaluation |
| **Similarity-weighted Prediction** | Fuel consumption forecasting | `predictFuelConsumption()` with historical data weighting |

### Mathematical Models

| Model | Purpose | Implementation |
|-------|---------|----------------|
| **Fuel Consumption Formula** | Calculate fuel requirements | Multi-factor formula in `calculateBaseFuelConsumption()` |
| **Non-linear Speed-Fuel Relation** | Model speed impact on fuel | Power function `Math.pow(speed/20, 1.5)` for non-linear relationship |
| **Weather Impact Quantification** | Calculate weather effects | `calculateWeatherMultiplier()` with factor analysis |
| **Normalized Efficiency Scoring** | Compare route efficiency | `(route.distance)/(duration*speed)` for comparison metrics |

### Key Advantages

1. **Hybrid Approach**: Combining deterministic calculations with data-driven insights
2. **Contextual Adaptation**: Algorithms adjust to specific voyage conditions
3. **Computational Efficiency**: Algorithms designed for real-time operation
4. **Learning Capability**: System improves with operational experience
5. **Explainable Results**: Clear relationship between inputs and recommendations

## Deployment Architecture

### AWS Infrastructure

```
                          GitHub
                            │
                            ▼
                     GitHub Actions CI/CD
                            │
                            ▼
         ┌───────────────────────────────────┐
         │                                   │
         │          AWS Cloud                │
         │                                   │
         │     ┌─────────────────┐           │
         │     │                 │           │
         │     │  Elastic Load   │           │
         │     │  Balancer (ELB) │           │
         │     │                 │           │
         │     └────────┬────────┘           │
         │              │                    │
         │              ▼                    │
         │     ┌─────────────────┐           │
         │     │  EC2 Instances  │           │
         │     │  Auto-scaling   │◄───┐      │
         │     │  Group          │    │      │
         │     └────────┬────────┘    │      │
         │              │             │      │
         │              ▼             │      │
         │     ┌─────────────────┐    │      │
         │     │                 │    │      │
         │     │  MongoDB Atlas  │────┘      │
         │     │                 │           │
         │     └─────────────────┘           │
         │                                   │
         └───────────────────────────────────┘
```

### Key Components
- AWS EC2 Instance
- Elastic Load Balancer
- MongoDB Atlas
- CI/CD Pipeline

GitHub Actions workflow:
```
Code Push → Linting → Testing → Deployment
```
