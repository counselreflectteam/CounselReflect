# CounselReflect Frontend

A modern React + TypeScript web application for analyzing therapeutic conversations using AI-powered evaluation metrics. CounselReflect provides therapists and researchers with tools to assess conversation quality across multiple dimensions including empathy, therapeutic techniques, safety, and adherence to clinical guidelines.

## Overview

CounselReflect is the web interface for the LLM Model Therapist Tool. It connects to a FastAPI backend to evaluate mental health conversations using three powerful evaluation approaches:

1. **Predefined Metrics**: Pre-trained ML models for specific therapeutic metrics
2. **Literature-Based Benchmarks**: Research-backed rubrics evaluated by GPT-4
3. **Customized Metrics**: AI-assisted custom metric creation and refinement

## Features

### Core Features
- **Conversation Input**: Paste or type therapeutic conversations with role-based formatting
- **Multi-Modal Evaluation**: Choose from 70+ pre-trained and literature-based metrics
- **Custom Metric Builder**: Create and refine custom evaluation criteria using OpenAI
- **Interactive Dashboard**: Visualize results with charts, tables, and detailed rationales
- **API Key Management**: Secure local storage of API keys with validation

### Advanced Features
- **Literature Highlighting**: Highlight text from original conversations based on metric scores
- **Example Selection**: Choose from curated datasets (ESConv, AnnoMI) for metric calibration
- **Iterative Refinement**: Refine metrics based on example outputs and feedback
- **Export Results**: Download evaluation results (feature in progress)

## Project Structure

```
frontend/
├── index.html                          # HTML entry point with TailwindCSS
├── package.json                        # Dependencies and scripts (uses @counselreflect/shared)
├── tsconfig.json                       # TypeScript configuration
├── vite.config.ts                      # Vite build configuration
├── public/                             # Static assets
└── src/
    ├── index.tsx                       # React entry point
    ├── App.tsx                         # Main application component
    ├── navigationConfig.tsx            # Navigation and routing setup
    ├── components/                     # Frontend-specific React components
    │   ├── layout/                     # Layout components (Header, Navigation)
    │   └── ...                         # Other application-specific views
    ├── pages/                          # Main page views (Dashboard, Settings, etc.)
    ├── context/                        # Frontend-specific Context providers
    ├── hooks/                          # Frontend-specific custom hooks
    └── utils/                          # Frontend-specific utility functions

**Note:** Core shared components, API services, contexts, and types not listed above are imported from the `@counselreflect/shared` package.
```

## Installation

### Prerequisites

- **Node.js** (v18 or higher recommended)
- **npm** or **yarn**

### Setup

1. **Navigate to the frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
3. **Set up environment variables** (optional):
   Create a `.env.local` file in the frontend/extension directory:
   ```env
   VITE_API_BASE_URL=http://localhost:8000
   ```
   
   **Note**: API keys are managed through the UI and stored in localStorage, not in environment variables.

## Running the Application

### Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173` (or another port if 5173 is occupied).

### Production Build

```bash
npm run build
```

Build output will be in the `dist/` directory.

## Using CounselReflect

### Step 1: Configure API Access

1. Enter your OpenAI API key (required for literature and custom metrics)
2. Optionally add HuggingFace API key for additional models
3. Click "Verify API Keys" to validate

Keys are stored securely in your browser's localStorage.

### Step 2: Input Conversation

Choose one of three input methods:
1. **Paste Conversation**: Paste a conversation in role-based format
2. **Manual Entry**: Build conversation turn-by-turn
3. **Load Sample**: Use the built-in sample conversation

### Step 3: Configure Evaluation

Select from three evaluation modes:

#### A. Predefined Metrics
Choose from 10 pre-trained ML models:
- **Empathy**: ER (Emotional Reaction), IP (Interpretation), EX (Exploration)
- **Safety**: Toxicity detection, Fact scoring
- **Communication**: Talk Type, Active Listening, PAIR reflection scoring
- **Emotion**: Emotion analysis, Emotional support strategies

#### B. Literature Benchmarks
Access 69 research-backed metrics from therapeutic literature:
- Clinical information accuracy
- Therapeutic guideline adherence
- Crisis safety protocols
- And many more...

#### C. Customized Metrics
Create your own evaluation criteria:
1. Describe your needs in natural language
2. AI generates structured metrics with rubrics
3. Test on example conversations
4. Refine based on results
5. Lock final profile for reuse

### Step 4: Review Results

The Results Dashboard provides:
- **Metric Cards**: Overview of scores for each metric
- **Detailed Tables**: Per-utterance scores with rationales
- **Visualizations**: Charts showing patterns across the conversation
- **Literature Highlighting**: Click metrics to see highlighted text in original conversation

## API Integration

CounselReflect connects to the FastAPI backend at `http://localhost:8000` by default.

### Required Backend Endpoints

- `GET /metrics` - List available pre-trained metrics
- `POST /evaluate` - Evaluate with pre-trained metrics
- `GET /literature/metrics` - List literature-based metrics
- `POST /literature/evaluate` - Evaluate with literature metrics
- `POST /openai/refine_metrics` - Refine custom metrics
- `POST /openai/score_with_profile` - Score with custom profile
- `GET /openai/list_sources` - List example sources
- `POST /openai/select_from_sources` - Select examples

See the [API README](../api/README.md) for backend setup instructions.

## Configuration

### Environment Variables

Create a `.env.local` file with optional configuration:

```env
# API Base URL (default: http://localhost:8000)
VITE_API_BASE_URL=http://localhost:8000

# Optional: Enable debug mode
VITE_DEBUG=false
```

### TailwindCSS Configuration

TailwindCSS is loaded via CDN in `index.html` with custom configuration:
- Dark mode enabled with `class` strategy
- Custom color: `slate-850` (#1e293b)
- Inter font family from Google Fonts

## Features in Detail

### Dark Mode
Toggle between light and dark modes using the theme switcher in the header. Preference is saved to localStorage.

### Literature Highlighting
When viewing literature metric results:
1. Click on a metric name in the dashboard
2. Text scored 4-5 on that metric highlights in the conversation view
3. Different colors for different score levels

### Custom Metric Workflow
1. **Draft**: Describe metrics in natural language
2. **Refine**: AI generates structured metric definitions
3. **Calibrate**: Test on example conversations
4. **Iterate**: Provide feedback and refine
5. **Lock**: Save final profile for future use

### Example Selection
Choose calibration examples from:
- **ESConv**: Emotional support conversations
- **AnnoMI**: Motivational interviewing dialogues
- Deterministic selection with seed parameter

## Development

### Code Style
- Use TypeScript for type safety
- Follow React best practices and hooks patterns
- Use functional components with hooks
- Organize code into logical components and contexts
- Import shared resources from `@counselreflect/shared`

### State Management
Most core state management is handled by contexts provided from `@counselreflect/shared`:
- **AuthContext**: API key management
- **MetricsContext**: Metric definitions and selections
- **EvaluationStateContext**: Conversation and results
- **ThemeContext**: Dark mode state

### Adding New Components
1. Create component in `src/components/` (if frontend-specific) or in the `shared` package (if used by extension too).
2. Use TypeScript with proper typing
3. Import types from `@counselreflect/shared`
4. Use context hooks for shared state

## Troubleshooting

### API Connection Issues
- Ensure backend is running on `http://localhost:8000`
- Check CORS settings in backend
- Verify API keys are valid

### Build Errors
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Clear Vite cache: `rm -rf node_modules/.vite`

### Runtime Errors
- Check browser console for detailed errors
- Verify all required API keys are configured
- Ensure conversation format matches expected schema

## Related Documentation

- **Backend API**: See `../api/README.md` for API documentation
- **Chrome Extension**: See `../extension/README.md` for extension integration
- **Deployment**: See `../EC2_DEPLOYMENT.md` for deployment instructions

## Contributing

Contributions are welcome! When contributing:

1. **UI Components**: Follow existing patterns in `components/`
2. **State Management**: Use existing contexts or create new ones as needed
3. **API Integration**: Add new services in `services/`
4. **Testing**: Add tests for new components/features

## License

MIT License (or as specified in root LICENSE file)

## Support

For issues or questions:
1. Check the browser console for error messages
2. Review the API backend logs
3. Consult the inline component documentation
4. See conversation history for recent changes
