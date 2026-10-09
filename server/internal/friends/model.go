// Package friends lets users add each other by a friend code and see each other's shared meals and gym check-ins,
// cheer them and comment on them. Only friends see anything; to anyone else a post or a friend is 404.
//
// A post is not a row of its own: it is a friend's shared meal (meal_logs.share_friends = true, key owner + date +
// meal index) or a friend's verified gym check-in of a day (gym_logs verified_by geofence/photo with a check-in time,
// shown only while the owner's settings.shareFriends is on). Cheers and comments point at that key.
package friends

import (
	"time"

	"github.com/yuntyu01/fitdoing/server/internal/platform"
)

// Code is a user's friend code (table friend_codes), made on the first request. Others add the user with it.
type Code struct {
	UserID    string    `gorm:"column:user_id;primaryKey;size:64"`
	Code      string    `gorm:"column:code;size:8;not null;uniqueIndex:ux_friend_code"`
	CreatedAt time.Time `gorm:"column:created_at;not null"`

	User *platform.User `gorm:"foreignKey:UserID;references:ID;constraint:OnDelete:CASCADE"`
}

func (Code) TableName() string { return "friend_codes" }

// Friendship is one direction of a friendship (table friendships). Adding stores both directions, removing deletes both.
type Friendship struct {
	UserID    string    `gorm:"column:user_id;primaryKey;size:64"`
	FriendID  string    `gorm:"column:friend_id;primaryKey;size:64;index"`
	CreatedAt time.Time `gorm:"column:created_at;not null"`

	User   *platform.User `gorm:"foreignKey:UserID;references:ID;constraint:OnDelete:CASCADE"`
	Friend *platform.User `gorm:"foreignKey:FriendID;references:ID;constraint:OnDelete:CASCADE"`
}

func (Friendship) TableName() string { return "friendships" }

// Kind of a post.
const (
	KindMeal = "meal"
	KindGym  = "gym"
)

// Cheer is one user's cheer on one post (table friend_cheers): at most one per user and post.
type Cheer struct {
	UserID    string        `gorm:"column:user_id;primaryKey;size:64"`
	OwnerID   string        `gorm:"column:owner_id;primaryKey;size:64;index:ix_friend_cheers_post,priority:1"`
	Kind      string        `gorm:"column:kind;primaryKey;size:4;index:ix_friend_cheers_post,priority:2;check:ck_friend_cheers_kind,kind IN ('meal','gym')"`
	PostDate  platform.Date `gorm:"column:post_date;primaryKey;size:10;index:ix_friend_cheers_post,priority:3"`
	MealIndex int           `gorm:"column:meal_index;primaryKey;autoIncrement:false;index:ix_friend_cheers_post,priority:4"`
	CreatedAt time.Time     `gorm:"column:created_at;not null"`

	User  *platform.User `gorm:"foreignKey:UserID;references:ID;constraint:OnDelete:CASCADE"`
	Owner *platform.User `gorm:"foreignKey:OwnerID;references:ID;constraint:OnDelete:CASCADE"`
}

func (Cheer) TableName() string { return "friend_cheers" }

// Comment is one comment on a post (table friend_comments). Only its author can delete it.
type Comment struct {
	ID        string        `gorm:"column:id;primaryKey;size:36"`
	AuthorID  string        `gorm:"column:author_id;size:64;not null;index"`
	OwnerID   string        `gorm:"column:owner_id;size:64;not null;index:ix_friend_comments_post,priority:1"`
	Kind      string        `gorm:"column:kind;size:4;not null;index:ix_friend_comments_post,priority:2;check:ck_friend_comments_kind,kind IN ('meal','gym')"`
	PostDate  platform.Date `gorm:"column:post_date;size:10;not null;index:ix_friend_comments_post,priority:3"`
	MealIndex int           `gorm:"column:meal_index;not null;index:ix_friend_comments_post,priority:4"`
	Body      string        `gorm:"column:body;size:1200;not null"`
	CreatedAt time.Time     `gorm:"column:created_at;not null"`

	Author *platform.User `gorm:"foreignKey:AuthorID;references:ID;constraint:OnDelete:CASCADE"`
	Owner  *platform.User `gorm:"foreignKey:OwnerID;references:ID;constraint:OnDelete:CASCADE"`
}

func (Comment) TableName() string { return "friend_comments" }

// Models lists the tables of this package for AutoMigrate (after users).
func Models() []any { return []any{&Code{}, &Friendship{}, &Cheer{}, &Comment{}} }
