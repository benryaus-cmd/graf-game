# 3D Game Template

An Aippy template for 3D interactive applications using Three.js and React.

## Features

- **Three.js Rendering**: Hardware-accelerated 3D graphics
- **Native Three.js Integration**: Direct Three.js API usage for maximum stability
- **React Hooks**: Clean integration using useEffect and useRef patterns
- **Performance Optimized**: Full control over render loop and resource management

## Tech Stack

- React 19 with TypeScript
- Three.js for 3D rendering
- Native Three.js integration (not React Three Fiber)
- Vite for fast development and building
- Tailwind CSS for styling
- @aippy/runtime for Aippy integration

## Why Native Three.js?

This template uses native Three.js instead of React Three Fiber (R3F) because:
- **Stability**: Better compatibility with React 19
- **AI-Friendly**: Better supported by AI code generation tools
- **Performance**: Full control over render loop without React scheduling overhead
- **Maintenance**: Lower tech debt - not affected by React version updates

## Example

The default example demonstrates a 3D Earth with:
- Realistic earth texture mapping
- Mouse/touch rotation controls
- Pinch-to-zoom support

## Project Structure

```
src/
├── main.tsx                 # Application entry point
├── App.tsx                  # Root component, handles window resize and dimensions
├── components/
│   └── WorldScene.tsx      # Three.js first-person city scene
├── index.css               # Global styles
└── vite-env.d.ts           # Vite type definitions
```

### Key Files

- **App.tsx**: Root component for the spray-paint sandbox and its mobile controls.
- **components/WorldScene.tsx**: First-person city scene, movement, sky, and wall painting.

## Development

```bash
pnpm install
pnpm run dev
```

## Build

```bash
pnpm run build
```

## License

Private
