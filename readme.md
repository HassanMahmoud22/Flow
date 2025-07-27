# Total.js Flow v10 - Dynamic Component Registration

This project extends Total.js Flow v10 with a dynamic component registration system that allows creating and registering new flow components at runtime via REST API.

## 🚀 Features

- **Dynamic Component Registration**: Register new components via REST API
- **Global Component Management**: Components are available across all flows
- **Native Integration**: Registered components behave exactly like native components
- **Real-time Persistence**: Components are saved to database and persist across restarts
- **Clean Architecture**: Modular design with separated concerns

## 🏗️ Architecture

### Core Components

1. **ComponentManager Module** (`modules/component-manager.js`)
   - Handles component validation, HTML generation, and registration
   - Manages Flow system reloading
   - Encapsulates all component-related logic

2. **API Controller** (`controllers/api.js`)
   - Provides REST endpoint for component registration
   - Delegates to ComponentManager for processing
   - Maintains clean separation of concerns

3. **Flow Integration** (`schemas/streams.js`)
   - Automatically registers global components with new flows
   - Ensures components are available in all flows

### Data Flow

```
POST /api/flow/register
    ↓
ComponentManager.validate()
    ↓
ComponentManager.generateHtml()
    ↓
Save to Flow.db.components
    ↓
Register with all existing flows
    ↓
Reload Flow system
    ↓
Component appears in UI
```

## 📋 API Reference

### Register Component

**Endpoint:** `POST /api/flow/register`

**Content-Type:** `application/json`

**Request Body:**
```json
{
  "name": "component_id",
  "displayName": "Component Display Name",
  "icon": "ti ti-code",
  "group": "Custom",
  "color": "#ff6600",
  "code": "console.log('Component executed:', data); $.send('output', data);",
  "inputs": "[{\"id\":\"input\",\"name\":\"Input\"}]",
  "outputs": "[{\"id\":\"output\",\"name\":\"Output\"}]",
  "settings": "<div>Component settings</div>",
  "readme": "# Component Documentation",
  "version": "1.0.0",
  "author": "Your Name",
  "meta": "{\"readonly\":false,\"singleton\":false,\"hidden\":false,\"remove\":true}"
}
```

**Required Fields:**
- `name`: Component identifier (alphanumeric and underscores only)
- `code`: JavaScript code to execute when component receives data

**Optional Fields:**
- `displayName`: Human-readable name (defaults to `name`)
- `icon`: Tabler icon class (defaults to `ti ti-code`)
- `group`: Component group (defaults to `Custom`)
- `color`: Component color (defaults to `#ff6600`)
- `inputs`: JSON array of input definitions
- `outputs`: JSON array of output definitions
- `settings`: HTML for component settings panel
- `readme`: Markdown documentation
- `version`: Component version (defaults to `1.0.0`)
- `author`: Component author (defaults to `API`)
- `meta`: JSON object with component metadata

**Response:**
```json
{
  "success": true,
  "value": {
    "success": true,
    "id": "component_id",
    "message": "Component registered successfully",
    "component": {
      "id": "component_id",
      "name": "Component Display Name",
      "icon": "ti ti-code",
      "group": "Custom",
      "color": "#ff6600"
    }
  }
}
```

## 🧪 Testing

### 1. Start the Application

```bash
node index.js
```

The application will start on `http://localhost:8000`

### 2. Register a Test Component

```bash
curl -X POST http://localhost:8000/api/flow/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "hello_world",
    "displayName": "Hello World Component",
    "icon": "ti ti-world",
    "group": "Examples",
    "color": "#00ff00",
    "code": "console.log(\"Hello World!\", data); $.send(\"output\", {message: \"Hello from API component!\", data: data});"
  }'
```

### 3. Verify Component Registration

Check the database to confirm the component was saved:

```bash
grep -A 5 -B 5 "hello_world" flowstream/database.json
```

### 4. Test Frontend Integration

1. Open `http://localhost:8000` in your browser
2. Login with the default credentials
3. Create a new flow or open an existing one
4. Verify the component appears in the sidebar
5. Drag the component to the canvas
6. Test the component's functionality

### 5. Test Component Persistence

1. Restart the application: `pkill -f "node index.js" && node index.js`
2. Open the flow designer
3. Verify the component still appears in the sidebar

## 🔧 Technical Implementation

### Component HTML Generation

The system generates native-compatible HTML with the following structure:

```html
<script total>
    exports.id = 'component_id';
    exports.name = 'Component Name';
    exports.icon = 'ti ti-code';
    exports.author = 'API';
    exports.version = '1.0.0';
    exports.group = 'Custom';
    exports.config = {};
    exports.inputs = [{'id':'input','name':'Input'}];
    exports.outputs = [{'id':'output','name':'Output'}];

    exports.make = function(instance, config) {
        instance.message = function($) {
            var data = $.data;
            try {
                // User-provided code here
                console.log('Component executed:', data);
                $.send('output', data);
            } catch (e) {
                console.error('Error in component:', e);
                $.send('output', { error: e.message, originalData: data });
            }
        };
        // ... lifecycle methods
    };
</script>

<readme># Component Documentation</readme>
<settings><div>Component settings</div></settings>
<style>.CLASS footer { padding: 10px; font-size: 12px; }</style>
<script>
    // Client-side lifecycle handlers
    TOUCH(function(exports, reinit) {
        // ... component lifecycle methods
    });
</script>
<body>
    <header><i class="$ICON" style="color:#ff6600"></i>$NAME</header>
    <footer>API-registered component</footer>
</body>
```

### Flow Integration

When a new flow is created, the system automatically registers all global components:

```javascript
// In schemas/streams.js
if (Flow.db.components) {
    for (const [componentId, componentHtml] of Object.entries(Flow.db.components)) {
        model.components[componentId] = componentHtml;
    }
}
```

### Database Structure

Components are stored in `flowstream/database.json`:

```json
{
  "components": {
    "component_id": "<component_html_string>"
  },
  "flow_id": {
    "components": {
      "component_id": "<component_html_string>"
    }
  }
}
```

## 🛠️ Development

### Project Structure

```
flow/
├── controllers/
│   └── api.js                 # REST API endpoints
├── modules/
│   └── component-manager.js   # Component management logic
├── schemas/
│   └── streams.js            # Flow creation and management
├── flowstream/
│   └── database.json         # Component and flow storage
└── index.js                  # Application entry point
```

### Key Files Modified

1. **`controllers/api.js`**
   - Added component registration endpoint
   - Integrated ComponentManager module

2. **`modules/component-manager.js`** (New)
   - Component validation and HTML generation
   - Flow system reloading
   - Database persistence

3. **`schemas/streams.js`**
   - Modified flow creation to include global components

### Adding New Features

To extend the component registration system:

1. **Add validation rules** in `ComponentManager.validate()`
2. **Extend HTML generation** in `ComponentManager.generateHtml()`
3. **Add new API endpoints** in `controllers/api.js`
4. **Update documentation** in this README

## 🔒 Security Considerations

- Component names are validated (alphanumeric and underscores only)
- Code is properly escaped to prevent injection attacks
- Components are isolated in their own execution context
- Input validation prevents malformed data

## 📝 License

This project extends Total.js Flow v10. See the original Total.js license for details.

## 🤝 Contributing

1. Follow the existing code structure
2. Add comprehensive tests for new features
3. Update documentation for any API changes
4. Ensure backward compatibility

---

**Note:** This implementation provides a clean, modular approach to dynamic component registration while maintaining full compatibility with the existing Total.js Flow system.
