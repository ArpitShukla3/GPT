# Python Backend Boilerplate

FastAPI backend boilerplate with:

- CORS support
- route/controller/service layering
- SQLAlchemy models
- Pydantic schemas
- reusable config and database session setup

## Structure

```text
.
├── app
│   ├── core
│   │   ├── config.py
│   │   └── cors.py
│   ├── db
│   │   ├── base.py
│   │   └── session.py
│   ├── models
│   │   └── user.py
│   ├── routes
│   │   ├── health_routes.py
│   │   └── user_routes.py
│   ├── schemas
│   │   └── user.py
│   ├── controllers
│   │   ├── health_controller.py
│   │   └── user_controller.py
│   ├── services
│   │   └── user_service.py
│   ├── utils
│   │   └── errors.py
│   └── main.py
├── .env.example
├── requirements.txt
└── README.md
```

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m app
```

`APP_HOST`, `APP_PORT`, and `APP_ENV` are read from `.env` and used by the runner.

## Example endpoints

- `GET /health`
- `GET /api/users`
- `POST /api/users`
- `GET /api/users/{user_id}`
- `PUT /api/users/{user_id}`
- `DELETE /api/users/{user_id}`
