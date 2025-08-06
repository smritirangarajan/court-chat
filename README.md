# Court Chat 🏛️

**An AI-Powered Legal Research Assistant for U.S. Supreme Court Cases**

![Uploading Screenshot 2025-08-05 at 6.50.09 PM.png…]()


Court Chat is a sophisticated legal research tool designed specifically for **legal professionals** to efficiently explore and analyze U.S. Supreme Court opinions. Leveraging advanced semantic search technology, it enables attorneys, paralegals, law students, and legal researchers to query decades of Supreme Court decisions using natural language, significantly reducing research time and improving case discovery.

## 🎯 Target Audience

This application is designed for:
- **Practicing attorneys** conducting case law research
- **Legal researchers** analyzing judicial trends
- **Paralegals** supporting litigation efforts
- **Law students** studying constitutional law
- **Academic researchers** in legal studies
- **Judicial clerks** researching precedents

## ✨ Key Features

- 🔍 **Natural Language Queries** – Search Supreme Court opinions using plain English instead of complex legal databases
- 🧠 **Semantic Similarity Search** – Powered by OpenAI's embedding API to understand legal concepts and context
- 📄 **Structured Legal Data** – Access organized opinion chunks with comprehensive case metadata
- 🗂️ **Vector Database Storage** – Lightning-fast retrieval from Astra DB's vector-enabled document storage
- 📊 **Contextual Results** – Get relevant case excerpts grouped by legal significance
- 🌐 **Modern Web Interface** – Clean, professional UI built for legal workflows

![Search Results Example](./assets/search-results-example.png)

## 🛠️ Technology Stack

### Backend Infrastructure
- **FastAPI** – High-performance API framework with automatic documentation
- **Astra DB (DataStax)** – Vector-enabled NoSQL database for legal document storage
- **OpenAI API** – Advanced embedding models for semantic legal search
- **Python 3.8+** – Core backend language with legal data processing libraries

### Frontend Application
- **Next.js (App Router)** – React framework optimized for legal research workflows
- **TypeScript** – Type-safe development for reliable legal applications
- **Axios** – Robust API communication for legal data retrieval
- **CSS Modules** – Professional styling for legal interface components

## 📁 Project Architecture

```
court-chat/
│
├── backend/                    # API and data processing
│   ├── main.py                # FastAPI application with /chat endpoint
│   ├── models/                # Legal data models and schemas
│   ├── services/              # Legal search and processing logic
│   ├── .env                   # Backend configuration (excluded from repo)
│   └── requirements.txt       # Python dependencies
│
├── next-app/                  # Frontend application
│   ├── app/                   # Next.js app router structure
│   │   ├── api/chat/         # Chat API integration
│   │   └── page.tsx          # Main legal research interface
│   ├── components/            # Reusable UI components
│   │   ├── SearchInterface/   # Legal query input component
│   │   ├── ResultDisplay/     # Case opinion display
│   │   └── CaseMetadata/      # Case information component
│   ├── lib/                   # Utility functions for legal data
│   ├── styles/                # Professional legal interface styles
│   ├── .env                   # Frontend configuration (excluded from repo)
│   └── package.json           # Node.js dependencies
│
└── assets/                    # Documentation images and resources
```

## 🚀 Getting Started

### Prerequisites
- Python 3.8 or higher
- Node.js 16 or higher
- OpenAI API key with GPT and embedding access
- DataStax Astra DB account with vector search capabilities

### 1. Repository Setup
```bash
git clone https://github.com/your-username/court-chat.git
cd court-chat
```

### 2. Backend Configuration
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create your backend environment file:
```bash
# backend/.env
OPENAI_API_KEY=your_openai_api_key_here
ASTRA_DB_APPLICATION_TOKEN=your_astra_db_token
ASTRA_DB_API_ENDPOINT=your_astra_db_endpoint
ASTRA_DB_COLLECTION_OPINIONS=supreme_court_opinions
ASTRA_DB_COLLECTION_CASES=supreme_court_cases
```

Launch the API server:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend Setup
```bash
cd ../next-app
npm install
```

Configure your frontend environment:
```bash
# next-app/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_ENV=development
```

Start the development server:
```bash
npm run dev
```

## 💼 Legal Research Examples

### Constitutional Law Research
```
Query: "2022 immigration cases involving executive power"
Results: Relevant Supreme Court opinions discussing executive authority 
in immigration matters, with contextual excerpts and case citations.
```

### Civil Rights Analysis
```
Query: "First Amendment social media cases 2020-2024"
Results: Recent Supreme Court decisions on free speech in digital platforms,
with detailed opinion analysis and precedential relationships.
```

### Criminal Procedure Research
```
Query: "Fourth Amendment digital privacy smartphone searches"
Results: Court opinions on digital search and seizure, with constitutional
analysis and law enforcement guidelines.
```

## 🔧 API Documentation

Once the backend is running, access the interactive API documentation at:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

### Core Endpoints
- `POST /chat` – Submit legal research queries and receive structured case results
- `GET /cases/{case_id}` – Retrieve detailed case information and full opinions
- `GET /health` – System health check for production deployments

## 🛡️ Security & Compliance

Court Chat implements security best practices appropriate for legal applications:
- Environment-based configuration management
- API key protection and rotation capabilities
- Secure database connections with encryption in transit
- Input validation and sanitization for legal queries
- Rate limiting to prevent abuse

**Note**: This application is designed for legal research purposes. Always verify results with primary legal sources and consult with qualified legal counsel for case-specific advice.

## 📄 License & Legal Notice

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

**Disclaimer**: Court Chat is a research tool designed to assist legal professionals. It does not constitute legal advice and should not be used as a substitute for professional legal counsel. Users are responsible for verifying all legal information and citations through primary sources.

## 🤝 Contributing

We welcome contributions from the legal technology community! Please see our [Contributing Guidelines](CONTRIBUTING.md) for information on how to submit improvements, report issues, or suggest new features.

## 📞 Support

For technical support or legal research questions:
- **Issues**: [GitHub Issues](https://github.com/your-username/court-chat/issues)
- **Documentation**: [Wiki](https://github.com/your-username/court-chat/wiki)
- **Legal Research Support**: [support@court-chat.com](mailto:support@court-chat.com)

---

**Built for Legal Professionals** | **Powered by Advanced AI** | **Trusted by Legal Researchers**
