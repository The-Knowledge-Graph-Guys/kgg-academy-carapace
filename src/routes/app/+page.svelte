<script lang="ts">
	import { onMount } from "svelte";

	// The app lives one level above /app. Relative targets keep this working when the site is served
	// from a subpath (e.g. GitHub Pages project sites), where an absolute "/" would leave the site.
	onMount(() => {
		window.location.replace(window.location.pathname.replace(/app\/?$/, ""));
	});
</script>

<svelte:head>
	<meta http-equiv="refresh" content="0; url=./" />
</svelte:head>

<div class="flex flex-1 flex-col items-center justify-center p-6">
	<p class="text-muted-foreground mb-4">Carapace now lives at the root of this site.</p>
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve("/") is "/" without paths.base, which leaves a subpath deployment -->
	<a href="./" class="text-accent-foreground font-medium underline">Open Carapace</a>
</div>
