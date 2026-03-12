# GlucoOptimizer

Herramienta de gestión inteligente para diabetes tipo 1 con lazo cerrado (AndroidAPS).
Predicción de glucosa a 30/60/90 min, optimización metabólica y control de lipolisis.

## Requisitos previos

- Node.js 18+
- Python 3.10+
- Cuenta en MongoDB Atlas (gratis): https://www.mongodb.com/atlas

---

## 1. Configurar MongoDB Atlas

1. Ir a https://www.mongodb.com/atlas y crear cuenta gratuita
2. Crear un cluster (Free Tier M0)
3. En "Database Access" → crear usuario con contraseña
4. En "Network Access" → agregar IP `0.0.0.0/0` (para desarrollo)
5. En "Connect" → copiar la URI de conexión:
   `mongodb+srv://<user>:<password>@cluster.mongodb.net/glucooptimizer`

---

## 2. Backend (Node.js)

```bash
cd backend
npm install

# Crear archivo .env
cp .env.example .env
# Editar .env con tu MONGODB_URI y un JWT_SECRET aleatorio

npm run dev
# → API corriendo en http://localhost:3001
```

---

## 3. Frontend (React)

```bash
cd frontend
npm install
npm run dev
# → App en http://localhost:5173
```

---

## 4. ML Service (Python)

```bash
cd ml-service
python -m venv venv
source venv/bin/activate  # en Windows: venv\Scripts\activate
pip install -r requirements.txt

python main.py
# → API ML en http://localhost:8000
```

El servicio ML arranca con un modelo fisiológico base (sin PyTorch necesario).
Para entrenar el modelo LSTM con datos de OpenAPS:

```bash
# 1. Descargar datos de https://openaps.org/outcomes/data-commons/
# 2. Colocar CSVs en ml-service/data/openaps/
# 3. Entrenar:
python training/pretrain.py --data-dir data/openaps --epochs 50
```

---

## Arquitectura

```
frontend/      React + TypeScript + Vite + Tailwind + Recharts
backend/       Node.js + Express + MongoDB + JWT
ml-service/    Python + FastAPI + PyTorch LSTM
```

## Módulos

| Módulo | Descripción |
|--------|-------------|
| Dashboard | Glucosa en tiempo real + predicciones IA |
| Nutrición | Registro comidas + macros + búsqueda OpenFoodFacts |
| Ejercicio | Programas fuerza/HIIT/cardio + chequeo pre-ejercicio |
| Predicciones | Curvas t+30/60/90 + simulador "qué pasa si..." |
| Análisis | TIR, score diario, lipolisis, logros |
| Ajustes | Conexión Nightscout + objetivos personales |

## Score de Lipolisis

```
Lipolisis = 35% déficit calórico + 35% insulina promedio baja + 20% actividad + 10% TIR
```

## Modelo IA

- **Día 1-30**: Modelo fisiológico base (reglas + coeficientes empíricos de OpenAPS)
- **Día 30+**: Fine-tuning LSTM con tus datos personales
- **Día 90+**: Modelo altamente personalizado
