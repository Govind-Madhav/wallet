# Deploying to Kubernetes (Minikube)

Follow these steps to build and run the Wallet application inside a local Minikube cluster.

## Prerequisites
- [Minikube](https://minikube.sigs.k8s.io/docs/start/) installed.
- [kubectl](https://kubernetes.io/docs/tasks/tools/) installed.
- Docker installed and running.

---

## Step 1: Start Minikube
Open your terminal and start your Minikube cluster:
```bash
minikube start
```

---

## Step 2: Set Docker Daemon Env
Point your local Docker shell context to Minikube's internal Docker daemon. This allows you to build images directly inside the cluster without needing a remote registry:

**PowerShell (Windows)**:
```powershell
& minikube -p minikube docker-env | Invoke-Expression
```

**Git Bash / Linux / macOS**:
```bash
eval $(minikube -p minikube docker-env)
```

---

## Step 3: Build the Images
Build the backend and frontend Docker images directly inside Minikube's context:

**1. Build the Backend Image**:
Run from the repository root:
```bash
docker build -t wallet-backend:latest .
```

**2. Build the Frontend Image**:
Run from the repository root:
```bash
docker build -f frontend/Dockerfile.prod -t wallet-frontend:latest ./frontend
```

---

## Step 4: Apply Kubernetes Manifests
Deploy the database storage, secrets, configs, and services into Minikube:

Run from the repository root:
```bash
# Create storage, secrets, and configurations
kubectl apply -f k8s/db-pvc.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmap.yaml

# Deploy services and workloads
kubectl apply -f k8s/db-deployment.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
```

---

## Step 5: Verify Deployment
Check that all pods are up and running:
```bash
kubectl get pods
```

---

## Step 6: Access the Application
Get the URL to access the frontend service running inside Minikube:
```bash
minikube service wallet-frontend-service
```
This command will open the Wallet web application in your default browser automatically.
