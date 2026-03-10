# Caddyfile Editor

A web-based editor for [Caddy](https://caddyserver.com/) configuration files with real-time validation, syntax highlighting, and an intuitive UI. This project provides a Caddy plugin that serves a modern web interface for editing Caddyfiles safely with live adaptation validation.

### ⚠️ Disclaimer
This Project should be relatively stable, but it's mostly encouraged for home use and more for convenience since you can override the whole Caddy config using a possibly unauthenticated endpoint

## Features

- **Web-Based Editor**: Modern, responsive UI for editing Caddyfiles from any browser
- **Real-Time Validation**: Validates your Caddyfile syntax as you type with live error/warning feedback
- **Syntax Highlighting**: Full syntax highlighting for Caddyfile language using Monaco Editor
- **Safety Features**: 
  - Warns when `admin_panel` directive is missing or commented out (prevents self-lockout)
  - Configuration adaptation validation before applying
  - Confirmation prompts before applying changes
- **Authentication**: Optional bcrypt-based HTTP Basic Auth for ""secure"" access
- **Configuration Management**:
  - Load the last known working Caddyfile
  - Download your configuration
  - Import Caddyfile from disk
- **Cross-Platform**: Works on desktop and mobile browsers
- **Dark/Light Theme**: Toggleable theme preference

## Installation

### Using `xcaddy`
The easiest way to build Caddy with the caddyfile-editor plugin is using `xcaddy`:

```bash
# Install xcaddy if you haven't already
go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest

# Build Caddy with the caddyfile-editor plugin
xcaddy build --with github.com/Complexicon/caddyfile-editor@<version>
```

This will create a caddy binary in your current directory with the plugin included.

### Building from Source

If you want to build from this repository directly:

```bash
# Clone the repository
git clone https://github.com/Complexicon/caddyfile-editor.git
cd caddyfile-editor

xcaddy build --with github.com/Complexicon/caddyfile-editor=./

# or for development purposes
go generate ./...
go build cmd/test
```

## Usage

### Basic Configuration

Add the `admin_panel` directive to your Caddyfile:

```
# Set module load order (optional, recommended)
{
    order admin_panel before respond
}

http://localhost:4000 {
    admin_panel no_password
}

# or using authentication

http://localhost:4001 {
	# replace the bcrypt hash with your own, username always is admin
    admin_panel bcrypt "$2a$12$Wv9hQoMf3AIa5qEdwd/95uq0oyJacFTD03/cMKnBAQ0zm54ovS/9K"
}

```