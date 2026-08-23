export default function App() {
  return (
    <div class="app-shell">
      <header class="top-bar">
        <a class="brand" href="/" aria-label="Joi home">
          Joi
        </a>
        <nav aria-label="Primary navigation">
          <a class="nav-link" href="#overview">
            Overview
          </a>
        </nav>
      </header>

      <main id="overview" class="main-content">
        <section class="content">
          <p class="eyebrow">Workspace</p>
          <h1>Joi UI</h1>
          <p class="summary">
            A foundation for building focused interfaces across the Joi
            libraries.
          </p>
        </section>
      </main>

      <footer class="footer">
        <span>Joi</span>
        <span>Built with SolidJS</span>
      </footer>
    </div>
  );
}
