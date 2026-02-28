# CounselReflect Shared

A shared package containing core React components, Context providers, API services, types, and utilities used across the CounselReflect project. 

This package allows the **CounselReflect Web Frontend** and **CounselReflect Chrome Extension** to share the same visual language, state management, and business logic, minimizing code duplication and ensuring a consistent user experience.

## ✨ Features

- 🧩 **UI Components**: Shared React UI components (Headers, Dashboards, Inputs, Configuration panels, etc.)
- 🌐 **API Services**: Reusable services for interacting with the CounselReflect backend (Literature metrics, Predefined metrics, OpenAI tools)
- 🗄️ **State Management**: Common React Context providers for authentication, evaluation state, metrics, and theming
- 🛠️ **Utilities**: Shared helpers for data processing, conversation parsing, and formatting
- 📝 **Types**: Common TypeScript definitions and interfaces

## 🚀 Setup & Usage

The shared package is imported directly into the `frontend` and `extension` modules. It is defined as a workspace package if you are using a monorepo structure, or simply linked as a local dependency.

### Dependencies

```json
{
  "dependencies": {
    "@counselreflect/shared": "*"
  }
}
```

### Importing from Shared

You can import all shared resources via the package name `@counselreflect/shared`:

```typescript
// Importing components
import { ResultsDashboard, Header } from '@counselreflect/shared';

// Importing Context
import { useAuth, ThemeProvider } from '@counselreflect/shared';

// Importing Services
import { literatureService } from '@counselreflect/shared';

// Importing Types
import { type MetricContextType, type EvaluationResult } from '@counselreflect/shared';
```

## 🏗️ Project Structure

```
shared/
├── src/
│   ├── components/          # Reusable React UI components
│   ├── constants/           # Shared sample data and predefined metric constants
│   ├── context/             # React context providers (Auth, Metrics, Theme, Evaluation)
│   ├── hooks/               # Custom React hooks
│   ├── services/            # API communication services
│   ├── utils/               # Utility functions
│   ├── types.ts             # TypeScript interfaces and types
│   └── index.ts             # Main export entrypoint
├── package.json             # Package definition
└── tsconfig.json            # TypeScript configuration
```

## 🛠️ Development

When adding new features or components that need to be used by both the Web Frontend and the Chrome Extension:

1. Add the component, service, or feature to the appropriate directory in `shared/src/`.
2. Ensure it is exported from `shared/src/index.ts`.
3. Rebuild or restart the development server on the consuming app (`frontend` or `extension`) to see the changes.

### Adding UI Components

- Ensure components use Tailwind CSS classes, as both frontend and extension use Tailwind for styling.
- Rely on the shared `ThemeContext` for dark/light mode consistency.

## 📝 License

This project is part of the CounselReflect mental health analytics suite.
