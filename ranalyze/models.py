"""
Provides classes for various database tables. All models are subclasses of
ModelObject, and each ModelObject subclass should have a corresponding
ModelObjectFactory subclass
"""

import abc

from datetime import datetime
from .constants import (
    COMMENT_FIELDS,
    CONFIG_ENTRY_FIELDS,
    POST_FIELDS,
    SUBREDDIT_FIELDS,
    WORD_DAY_FIELDS
)
from .utils import date_to_timestamp, sanitize_string


class ModelObject(object, metaclass=abc.ABCMeta):

    KEY = "id"

    def __init__(self, **kwargs):
        object.__setattr__(self, "_attrs",
                           {key: (kwargs[key] if key in kwargs else None)
                            for key in self.get_fields()})

    @staticmethod
    @abc.abstractmethod
    def get_fields():
        pass

    def keys(self):
        return self.get_fields()

    def __getitem__(self, item):
        return self.__getattr__(item)

    def __setitem__(self, key, value):
        self.__setattr__(key, value)

    def __getattr__(self, item):
        if item not in self.get_fields():
            message = ("No such attribute `{attribute}` in class "
                       "`{class_name}`").format(
                class_name=type(self).__name__,
                attribute=item
            )
            raise AttributeError(message)
        return self._attrs[item]

    def __setattr__(self, key, value):
        if key not in self.get_fields():
            message = ("No such attribute `{attribute}` in class "
                       "`{class_name}`").format(
                class_name=type(self).__name__,
                attribute=key
            )
            raise AttributeError(message)
        self._attrs[key] = value

    @property
    def dict(self):
        return self._attrs.copy()


class ModelFactory(object, metaclass=abc.ABCMeta):

    @classmethod
    def from_dict(cls, data):
        target = cls._get_target()
        return target(**data)

    @classmethod
    def from_row(cls, row):
        data = {key: row[key] for key in row.keys()}
        return cls.from_dict(data)

    @staticmethod
    @abc.abstractmethod
    def _get_target():
        """
        :rtype: Callable
        :return: Target class of the factory
        """
        pass


class WordDay(ModelObject):

    @staticmethod
    def get_fields():
        return WORD_DAY_FIELDS


class WordDayFactory(ModelFactory):

    @staticmethod
    def _get_target():
        return WordDay


class Entry(ModelObject, metaclass=abc.ABCMeta):
    """
    Base class for all database entries
    """
    pass


class EntryFactory(ModelFactory, metaclass=abc.ABCMeta):
    """
    Base class for all Entry factories
    """

    _BASE_PRAW_MAP = {
        "deleted": lambda e: False,
        "id": lambda e: e.fullname,
        "posted_by": lambda e: str(e.author),
        "subreddit": lambda e: str(e.subreddit).lower(),
        "time_submitted": lambda e: e.created_utc,
        "time_updated": lambda e: date_to_timestamp(datetime.utcnow()),
        "up_votes": lambda e: e.ups
    }

    @classmethod
    def from_praw(cls, praw_obj):
        """
        Creates an Entry from a PrawEntry object
        """
        attrs = {}
        target = cls._get_target()
        fields = target.get_fields()
        praw_map = cls._get_praw_map()
        for key in fields:
            if key in praw_map:
                attrs[key] = praw_map[key](praw_obj)
            else:
                attrs[key] = getattr(praw_obj, key)
        return target(**attrs)

    @staticmethod
    @abc.abstractmethod
    def _get_praw_map():
        """
        :rtype: dict
        :return: Dictionary mapping praw object attributes to functions
         which convert them to Entry attributes
        """
        pass


class Comment(Entry):
    """
    Class for comment entries into the database
    """

    @staticmethod
    def get_fields():
        return COMMENT_FIELDS


class CommentFactory(EntryFactory):
    """
    Factory for creating Comment instances from various sources
    """

    # Converts praw.objects.Comment attributes to Comment attributes
    _PRAW_MAP = dict(
        EntryFactory._BASE_PRAW_MAP,
        #  text_content is encoded to utf8 to sanitize bad characters
        text_content=lambda c: sanitize_string(c.body),
        root_id=lambda c: c.submission.fullname
    )

    @staticmethod
    def _get_target():
        return Comment

    @staticmethod
    def _get_praw_map():
        return CommentFactory._PRAW_MAP


class Post(Entry):
    """
    Class for post entries into the database
    """

    @staticmethod
    def get_fields():
        return POST_FIELDS


class PostFactory(EntryFactory):
    """
    Factory for creating Post instances from various sources
    """

    # Converts praw.objects.Submission attributes to Post attributes
    _PRAW_MAP = dict(
        EntryFactory._BASE_PRAW_MAP,
        external_url=lambda s: s.url,
        text_content=lambda s: sanitize_string(s.selftext),
        title=lambda s: sanitize_string(s.title),
        up_ratio=lambda s: 0  # TODO: Implement up_ratio?,
    )

    @staticmethod
    def _get_target():
        return Post

    @staticmethod
    def _get_praw_map():
        return PostFactory._PRAW_MAP


class ConfigEntry(ModelObject):

    @staticmethod
    def get_fields():
        return CONFIG_ENTRY_FIELDS


class ConfigEntryFactory(ModelFactory):

    @staticmethod
    def _get_target():
        return ConfigEntry


class Subreddit(ModelObject):

    KEY = "name"

    @staticmethod
    def get_fields():
        return SUBREDDIT_FIELDS


class SubredditFactory(ModelFactory):

    @staticmethod
    def _get_target():
        return Subreddit


class NoSuchAttributeError(AttributeError):
    """
    Errors for attempted access of non-existent attributes
    """

    _FORMAT = "No such attribute `{attribute}` in class `{class_name}`"

    def __init__(self, **kwargs):

        super().__init__(NoSuchAttributeError._FORMAT.format(**kwargs))
