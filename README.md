# D&D Campaign Manager

Interactive D&D campaign management with real-time character sheets, dice rolling, and AI-powered dungeon mastering.

## Directory Structure

```
/opt/dnd/
├── campaigns/           # Campaign data (default, test-silverpeak, etc.)
├── database/           # SQLite campaign databases
├── shared/             # Shared frontend components
├── docs/               # Documentation and analysis files
├── scripts/            # Utility scripts and old data archives
├── complete-intelligent-server.js  # Main backend server
├── game.html           # Dax campaign UI (legacy)
├── index.html          # Campaign splash page
└── *.js                # Core modules (combat, rules, memory, etc.)
```

## Quick Start

```bash
# Start server
pm2 restart dnd-enhanced

# View logs
pm2 logs dnd-enhanced

# Check status
curl http://localhost:3001/api/dnd/health
```

## Documentation

See `/opt/dnd/docs/CLAUDE.md` for full project documentation.

## Active Campaigns

- **Titan Station (Dax)**: https://vodbase.net/dnd/game.html
- **Silverpeak Chronicles**: https://vodbase.net/dnd/?campaign=test-silverpeak
