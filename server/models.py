import time
from enum import Enum

from pydantic import BaseModel, Field


class RoomStatus(str, Enum):
    waiting = "waiting"
    playing = "playing"
    finished = "finished"


class Room(BaseModel):
    id: str
    name: str = Field(min_length=1, max_length=50)
    max_players: int = Field(default=2, ge=2, le=4)
    players: list[str] = Field(default_factory=list)
    status: RoomStatus = RoomStatus.waiting
    created_at: float = Field(default_factory=time.time)


class CreateRoomRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    max_players: int = Field(default=2, ge=2, le=4)
