<script>
  import { asset } from '$app/paths';
  let { children } = $props();
  import '../app.css';

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
  <link rel="icon" href={asset('/favicon.svg')} type="image/svg+xml" />
</svelte:head>

{@render children()}
