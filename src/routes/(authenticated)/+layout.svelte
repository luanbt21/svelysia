<script lang="ts">
  import { authClient } from "$lib/auth-client";
  import { Button } from "$lib/components/ui/button";
  import ModeToggle from "$lib/components/mode-toggle.svelte";
  import { LogOut, FolderTree, User } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import { goto } from "$app/navigation";
  import { m } from "$lib/paraglide/messages.js";
  import LanguageSwitcher from "$lib/components/language-switcher.svelte";

  let { data, children } = $props();

  async function handleSignOut() {
    try {
      await authClient.signOut();
      toast.success(m.sign_out_success());
      goto("/login");
    } catch (error) {
      toast.error(m.sign_out_failed());
      console.error(error);
    }
  }
</script>

<div class="min-h-screen bg-muted/20 text-foreground flex flex-col">
  <!-- Navbar -->
  <header class="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <!-- Brand Logo -->
      <a href="/trees" class="flex items-center gap-2 font-serif text-xl font-bold tracking-tight text-primary">
        <FolderTree class="h-6 w-6 stroke-[2]" />
        <span>GiaPhảViệt</span>
      </a>

      <!-- Navbar Right -->
      <div class="flex items-center gap-4">
        <!-- User Badge -->
        <div class="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-muted/50 max-w-[200px] sm:max-w-xs">
          {#if data.user.image}
            <img src={data.user.image} alt={data.user.name} class="h-6 w-6 rounded-full object-cover" />
          {:else}
            <div class="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
              <User class="h-3 w-3 text-primary" />
            </div>
          {/if}
          <span class="text-sm font-medium truncate max-w-[100px] hidden sm:inline-block">
            {data.user.name || data.user.username || data.user.email}
          </span>
        </div>

        <!-- Language Switcher -->
        <LanguageSwitcher />

        <!-- Mode Watcher (Theme Toggle) -->
        <ModeToggle />

        <!-- Sign Out Button -->
        <Button variant="ghost" size="icon" onclick={handleSignOut} title={m.sign_out()}>
          <LogOut class="h-4 w-4" />
        </Button>
      </div>
    </div>
  </header>

  <!-- Page Content -->
  <main class="flex-1 flex flex-col">
    {@render children()}
  </main>
</div>

