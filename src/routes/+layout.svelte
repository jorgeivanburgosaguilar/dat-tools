<script>
  import { asset } from '$app/paths';
  import { page } from '$app/state';
  let { children } = $props();
  import '../app.css';

  /** @type {Record<string, string>} */
  const FAVICONS = {
    '/stopwatch': asset('/favicon-stopwatch.svg'),
    '/word-counter': asset('/favicon-word-counter.svg'),
    '/markdown-preview': asset('/favicon-markdown-preview.svg'),
    '/json-validator': asset('/favicon-json-validator.svg'),
    '/diff-checker': asset('/favicon-diff-checker.svg')
  };

  const favicon = $derived(FAVICONS[page.route.id ?? ''] ?? asset('/favicon.svg'));

  $effect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = (/** @type {MediaQueryListEvent} */ e) => {
      document.documentElement.classList.toggle('dark', e.matches);
    };
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} type="image/svg+xml" />
</svelte:head>

{@render children()}
