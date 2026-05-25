<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Calendar } from "$lib/components/ui/calendar";
  import * as Popover from "$lib/components/ui/popover";
  import {
    CalendarDate,
    getLocalTimeZone,
    parseDate,
    today,
  } from "@internationalized/date";
  import { Calendar as CalendarIcon } from "@lucide/svelte";
  import { Input } from "../input";

  type DateValue = CalendarDate | Date | string | undefined;
  type Props = {
    value?: DateValue;
    id: string;
    placeholder?: string;
    maxValue?: CalendarDate;
    disabled?: boolean;
    valueType?: "string" | "date" | "calendar";
  };

  let {
    value = $bindable<DateValue>(),
    id,
    placeholder = "DD/MM/YYYY",
    maxValue,
    disabled = false,
    valueType = undefined,
  }: Props = $props();

  let open = $state(false);

  // Parse DD/MM/YYYY format to CalendarDate
  function parseDDMMYYYY(str: string): CalendarDate | undefined {
    const parts = str.split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        if (
          year >= 1000 &&
          year <= 9999 &&
          month >= 1 &&
          month <= 12 &&
          day >= 1 &&
          day <= 31
        ) {
          try {
            return new CalendarDate(year, month, day);
          } catch (e) {
            return undefined;
          }
        }
      }
    }
    return undefined;
  }

  // Derive internal CalendarDate from external value
  const internalValue = $derived.by(() => {
    if (value instanceof Date) {
      return new CalendarDate(
        value.getFullYear(),
        value.getMonth() + 1,
        value.getDate(),
      );
    } else if (value && typeof value === "object" && "calendar" in value) {
      return value as CalendarDate;
    } else if (typeof value === "string" && value) {
      try {
        const clean = value.split("T")[0];
        return parseDate(clean);
      } catch (e) {
        return undefined;
      }
    }
    return undefined;
  });

  // Convert CalendarDate back to parent type
  function updateExternalValue(newDate: CalendarDate | undefined) {
    if (!newDate) {
      value = undefined;
      return;
    }

    let type: "string" | "date" | "calendar" = "calendar";
    if (valueType) {
      type = valueType;
    } else if (value instanceof Date) {
      type = "date";
    } else if (typeof value === "string") {
      type = "string";
    } else if (value && typeof value === "object" && "calendar" in value) {
      type = "calendar";
    } else {
      type = "string"; // default fallback
    }

    if (type === "date") {
      value = newDate.toDate(getLocalTimeZone());
    } else if (type === "string") {
      value = newDate.toString();
    } else {
      value = newDate;
    }
  }

  // Bindable adapter for Calendar primitive
  const calendarAdapter = {
    get value() {
      return internalValue;
    },
    set value(newValue: CalendarDate | undefined) {
      updateExternalValue(newValue);
    },
  };

  // Derive display text format (DD/MM/YYYY)
  const displayValue = $derived.by(() => {
    if (internalValue) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${pad(internalValue.day)}/${pad(internalValue.month)}/${internalValue.year}`;
    }
    return "";
  });

  // Handle keyboard entry in the text input
  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const parsed = parseDDMMYYYY(target.value);
    if (parsed) {
      if (maxValue && parsed.compare(maxValue) > 0) {
        return;
      }
      updateExternalValue(parsed);
    }
  }

  // Handle text input blur to reset invalid formatted entries
  function handleBlur(e: FocusEvent) {
    const target = e.target as HTMLInputElement;
    if (!target.value) {
      updateExternalValue(undefined);
    } else {
      const parsed = parseDDMMYYYY(target.value);
      if (!parsed || (maxValue && parsed.compare(maxValue) > 0)) {
        target.value = displayValue;
      }
    }
  }
</script>

<div
  class="flex items-center w-full h-9 rounded-3xl border border-transparent bg-input/50 transition-[color,box-shadow,background-color] focus-within:border-ring focus-within:ring-ring/30 focus-within:ring-3 focus-within:outline-none"
>
  <Input
    {id}
    type="text"
    {placeholder}
    {disabled}
    value={displayValue}
    oninput={handleInput}
    onblur={handleBlur}
    class="flex-1 h-full pl-4 pr-2 py-1 text-sm bg-transparent outline-none border-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
  />
  <Popover.Root bind:open>
    <Popover.Trigger id="{id}-date-trigger">
      {#snippet child({ props })}
        <Button
          {...props}
          variant="ghost"
          size="icon"
          class="h-full w-9 rounded-r-3xl rounded-l-none hover:bg-input/20 text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          {disabled}
        >
          <CalendarIcon class="h-4 w-4" />
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content
      class="w-auto overflow-hidden p-0 z-50 bg-background border shadow-md rounded-2xl"
      align="end"
    >
      <Calendar
        type="single"
        bind:value={calendarAdapter.value}
        captionLayout="dropdown"
        onValueChange={() => {
          open = false;
        }}
        {maxValue}
      />
    </Popover.Content>
  </Popover.Root>
</div>
