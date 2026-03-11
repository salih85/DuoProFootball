# Duo Pro Football

Duo Pro Football is an interactive, real-time multiplayer 2D football (air-hockey style) game built with Node.js, Express, and Socket.io. Players can compete against an AI in single-player mode, matchmake with random opponents online, or create private rooms to play with friends natively in the browser.

## Features

- **Real-time Multiplayer:** Play against other players worldwide with low-latency synchronization using Socket.io.
- **Single-player vs AI:** Hone your skills against an AI opponent with adjustable difficulty levels (Easy, Pro, Legend).
- **Private Rooms:** Create private matches and share the room code with friends for direct 1v1 play.
- **Cross-Platform Compatibility:** Responsive layout and touch controls optimized for both desktop and mobile devices.
- **Customization:** Choose your player's color before deploying to the pitch.
- **Smooth Gameplay:** Client-side prediction, interpolation, and server reconciliation implemented for seamless and snappy movements.

## Tech Stack

- **Backend:** Node.js, Express.js
- **Real-time Communication:** Socket.io
- **Frontend Template Engine:** EJS
- **Frontend Logic:** HTML5 Canvas, Vanilla JavaScript
- **Database Integration:** MongoDB & Mongoose
- **Styling:** Custom CSS

## Prerequisites

Before running the project locally, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v14.x or later)
- [npm](https://www.npmjs.com/) (Node Package Manager)

## Installation & Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/your-username/duoprofootball.git
   cd Multi-Player-Game
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Configure Environment Variables:**

   Create a `.env` file in the root directory and add any necessary environment variables (e.g. your database URI or port).

   ```env
   PORT=10000
   ```

4. **Start the server:**

   - For production environments:
     ```bash
     npm start
     ```
   - For development environments (requires `nodemon`):
     ```bash
     npm run dev
     ```

5. **Play the game:**

   Open your browser and navigate to `http://localhost:10000`.

## How to Play

### Controls
- **Desktop:** Use `W, A, S, D` or `Arrow Keys` to move your player.
- **Mobile/Touch Devices:** Tap and drag anywhere on your side of the screen, or continuously swipe towards the ball to move smoothly.

### Mechanics
- Bump the ball with your player character to strike it towards the opponent's goal.
- The momentum of your movement transfers to the ball for more powerful shots!
- The first player to reach the set win limit claims victory.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

This project is licensed under the ISC License.
