"""Tests for ECS system."""

from game.ecs.components import Health, Position, Stats
from game.ecs.entities import Entity, EntityManager


def test_entity_creation() -> None:
    """Test entity creation."""
    manager = EntityManager()
    entity = manager.create_entity()
    assert entity.id == 0
    assert len(manager.entities) == 1


def test_entity_components() -> None:
    """Test entity components."""
    manager = EntityManager()
    entity = manager.create_entity()

    pos = Position(10.0, 20.0)
    entity.add_component(pos)

    assert entity.has_component(Position)
    assert entity.get_component(Position) == pos
    assert entity.get_component(Position).x == 10.0
    assert entity.get_component(Position).y == 20.0


def test_health_component() -> None:
    """Test health component."""
    health = Health(current=50, maximum=100)
    assert health.is_alive()
    assert health.current == 50
    assert health.maximum == 100

    damage = health.take_damage(30)
    assert damage == 30
    assert health.current == 20

    damage = health.take_damage(30)
    assert damage == 20
    assert health.current == 0
    assert not health.is_alive()


def test_stats_component() -> None:
    """Test stats component."""
    stats = Stats(level=1, experience=0, experience_to_next=10)
    assert stats.level == 1

    leveled_up = stats.add_experience(15)
    assert leveled_up
    assert stats.level == 2
    assert stats.experience == 5

