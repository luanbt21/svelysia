<script lang="ts">
	import { authClient } from "$lib/auth-client";
	import { Svelte as Logo } from "$lib/components/svgs/index";
	import { Button } from "$lib/components/ui/button";
	import { Card } from "$lib/components/ui/card";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Spinner } from "$lib/components/ui/spinner";
	import { toast } from "svelte-sonner";
	import type { EventHandler } from "svelte/elements";

	let pending = $state(false);

	const handleSubmit: EventHandler<SubmitEvent, HTMLFormElement> = async (
		e,
	) => {
		e.preventDefault();
		pending = true;
		try {
			const data = new FormData(e.currentTarget);
			const email = data.get("email");
			if (!email) {
				toast.error("Email is required");
				return;
			}

			const { error } = await authClient.forgetPassword.emailOtp({
				email: email as string,
			});

			if (error) {
				toast.error(error.message || "Failed to request password reset link");
				return;
			}

			toast.success("Password reset link sent to your email!");
		} catch (err) {
			toast.error("Failed to request password reset");
			console.error(err);
		} finally {
			pending = false;
		}
	};
</script>

<section class="grid min-h-screen grid-rows-[auto_1fr] bg-background px-4">
	<div class="mx-auto w-full max-w-7xl border-b py-3">
		<Button
			href="/"
			aria-label="go home"
			variant="ghost"
			size="sm"
			class="inline-block h-auto border-t-2 border-transparent py-3 hover:bg-transparent"
		>
			<Logo class="w-fit" />
		</Button>
	</div>

	<div class="m-auto w-full max-w-sm">
		<div class="text-center">
			<h1 class="font-serif text-4xl font-medium">Forgot password?</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				Enter your email and we'll send you a reset link
			</p>
		</div>
		<Card class="mt-6 p-8">
			<form action="" class="space-y-5" onsubmit={handleSubmit}>
				<div class="space-y-3">
					<Label for="email" class="text-sm">Email</Label>
					<Input
						type="email"
						id="email"
						name="email"
						placeholder="you@example.com"
						required
						disabled={pending}
					/>
				</div>

				<Button class="w-full" type="submit" disabled={pending}>
					{#if pending}
						<Spinner />
					{/if}
					Send Reset Link
				</Button>
			</form>
		</Card>

		<p class="mt-6 text-center text-sm text-muted-foreground">
			Remember your password?
			<Button href="/login" variant="link" class="px-1 font-medium text-primary"
				>Sign in</Button
			>
		</p>
	</div>
</section>
