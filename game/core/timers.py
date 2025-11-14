"""Timer and cooldown system."""

from typing import Callable, Dict, Optional


class Timer:
    """Simple timer for delayed actions."""

    def __init__(self, duration: float, callback: Optional[Callable[[], None]] = None) -> None:
        """Initialize timer.

        Args:
            duration: Timer duration in seconds
            callback: Optional callback to call when timer expires
        """
        self.duration = duration
        self.remaining = duration
        self.callback = callback
        self.active = True

    def update(self, dt: float) -> bool:
        """Update timer. Returns True if expired."""
        if not self.active:
            return False

        self.remaining -= dt
        if self.remaining <= 0:
            self.active = False
            if self.callback:
                self.callback()
            return True
        return False

    def reset(self) -> None:
        """Reset timer to full duration."""
        self.remaining = self.duration
        self.active = True

    def cancel(self) -> None:
        """Cancel timer."""
        self.active = False


class Cooldown:
    """Cooldown system for abilities and actions."""

    def __init__(self, duration: float) -> None:
        """Initialize cooldown.

        Args:
            duration: Cooldown duration in seconds
        """
        self.duration = duration
        self.remaining = 0.0

    def update(self, dt: float) -> None:
        """Update cooldown."""
        if self.remaining > 0:
            self.remaining -= dt
            if self.remaining < 0:
                self.remaining = 0.0

    def is_ready(self) -> bool:
        """Check if cooldown is ready."""
        return self.remaining <= 0

    def trigger(self) -> bool:
        """Trigger cooldown. Returns True if was ready."""
        if self.is_ready():
            self.remaining = self.duration
            return True
        return False

    def get_progress(self) -> float:
        """Get cooldown progress (0.0 to 1.0)."""
        if self.duration <= 0:
            return 1.0
        return 1.0 - (self.remaining / self.duration)

    def get_remaining(self) -> float:
        """Get remaining cooldown time."""
        return max(0.0, self.remaining)


class TimerManager:
    """Manages multiple timers and cooldowns."""

    def __init__(self) -> None:
        """Initialize timer manager."""
        self.timers: Dict[str, Timer] = {}
        self.cooldowns: Dict[str, Cooldown] = {}

    def add_timer(self, name: str, duration: float, callback: Optional[Callable[[], None]] = None) -> Timer:
        """Add a timer."""
        timer = Timer(duration, callback)
        self.timers[name] = timer
        return timer

    def get_timer(self, name: str) -> Optional[Timer]:
        """Get a timer by name."""
        return self.timers.get(name)

    def remove_timer(self, name: str) -> None:
        """Remove a timer."""
        if name in self.timers:
            del self.timers[name]

    def add_cooldown(self, name: str, duration: float) -> Cooldown:
        """Add a cooldown."""
        cooldown = Cooldown(duration)
        self.cooldowns[name] = cooldown
        return cooldown

    def get_cooldown(self, name: str) -> Optional[Cooldown]:
        """Get a cooldown by name."""
        return self.cooldowns.get(name)

    def update(self, dt: float) -> None:
        """Update all timers and cooldowns."""
        # Update timers
        expired = []
        for name, timer in self.timers.items():
            if timer.update(dt):
                expired.append(name)

        # Remove expired timers
        for name in expired:
            del self.timers[name]

        # Update cooldowns
        for cooldown in self.cooldowns.values():
            cooldown.update(dt)

    def clear(self) -> None:
        """Clear all timers and cooldowns."""
        self.timers.clear()
        self.cooldowns.clear()

