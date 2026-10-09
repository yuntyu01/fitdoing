package friends

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/yuntyu01/fitdoing/server/internal/gym"
	"github.com/yuntyu01/fitdoing/server/internal/meal"
	"github.com/yuntyu01/fitdoing/server/internal/photo"
	"github.com/yuntyu01/fitdoing/server/internal/platform"
	"github.com/yuntyu01/fitdoing/server/internal/settings"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// codeAlphabet has no lookalikes (no 0/O, 1/I/L): a code is read aloud or typed from a screenshot.
const (
	codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
	codeLen      = 8
	// DefaultName is shown for a friend who has not set a nickname.
	DefaultName = "친구"
	maxComment  = 300
	// DefaultLimit and MaxLimit bound one feed page.
	DefaultLimit = 20
	MaxLimit     = 50
)

// gymShared are the gym check-ins that count as a post (a rest-coupon day is not a workout).
var gymShared = []string{string(gym.Geofence), string(gym.Photo)}

type Service struct {
	db     *gorm.DB
	photos *photo.Service
}

func NewService(db *gorm.DB, photos *photo.Service) *Service { return &Service{db, photos} }

var (
	errNotFound     = platform.NotFound("친구 기록을 찾을 수 없어요")
	errFriendAbsent = platform.NotFound("친구를 찾을 수 없어요")
	errCodeNotFound = &platform.Error{Status: http.StatusNotFound, Code: "FRIEND_CODE_NOT_FOUND",
		Message: "그 코드의 사용자가 없어요"}
	errSelf = platform.BadRequest("CANNOT_ADD_SELF", "내 코드로는 친구를 추가할 수 없어요")
)

// ---- 친구 코드 ----

func newCode() (string, error) {
	b := make([]byte, codeLen)
	max := big.NewInt(int64(len(codeAlphabet)))
	for i := range b {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		b[i] = codeAlphabet[n.Int64()]
	}
	return string(b), nil
}

// Code returns the user's friend code, creating it on the first call.
func (s *Service) Code(userID string) (string, error) {
	for range 5 {
		var c Code
		err := s.db.First(&c, "user_id = ?", userID).Error
		if err == nil {
			return c.Code, nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return "", err
		}
		code, err := newCode()
		if err != nil {
			return "", err
		}
		// A clash (same code taken, or a parallel first request) just tries again; the read above settles the race.
		if err := s.db.Omit("User").Create(&Code{UserID: userID, Code: code, CreatedAt: time.Now().UTC()}).Error; err == nil {
			return code, nil
		}
	}
	return "", errors.New("friend code: could not create a unique code")
}

// NormalizeCode upper-cases a typed code and drops spaces and dashes.
func NormalizeCode(s string) string {
	s = strings.ToUpper(s)
	return strings.Map(func(r rune) rune {
		if r == ' ' || r == '-' || r == '\t' {
			return -1
		}
		return r
	}, s)
}

// ---- 친구 목록 ----

// Friend is one friend in the list.
type Friend struct {
	ID    string    `json:"id"`
	Name  string    `json:"name"`
	Since time.Time `json:"since"`
}

// Add makes the owner of code a friend (both directions). Adding an existing friend again is fine.
func (s *Service) Add(userID, code string) (Friend, error) {
	code = NormalizeCode(code)
	if code == "" {
		return Friend{}, platform.Invalid("code", "필수예요")
	}
	var c Code
	err := s.db.First(&c, "code = ?", code).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return Friend{}, errCodeNotFound
	}
	if err != nil {
		return Friend{}, err
	}
	if c.UserID == userID {
		return Friend{}, errSelf
	}
	now := time.Now().UTC()
	err = s.db.Transaction(func(tx *gorm.DB) error {
		rows := []Friendship{{UserID: userID, FriendID: c.UserID, CreatedAt: now}, {UserID: c.UserID, FriendID: userID, CreatedAt: now}}
		return tx.Omit("User", "Friend").Clauses(clause.OnConflict{DoNothing: true}).Create(&rows).Error
	})
	if err != nil {
		return Friend{}, err
	}
	return s.friend(userID, c.UserID)
}

// friend returns one friend of userID, 404 when they are not friends.
func (s *Service) friend(userID, friendID string) (Friend, error) {
	var f Friendship
	err := s.db.First(&f, "user_id = ? AND friend_id = ?", userID, friendID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return Friend{}, errFriendAbsent
	}
	if err != nil {
		return Friend{}, err
	}
	names, err := s.owners([]string{friendID})
	if err != nil {
		return Friend{}, err
	}
	return Friend{friendID, names.name(friendID), f.CreatedAt}, nil
}

// List is the user's friends, newest first.
func (s *Service) List(userID string) ([]Friend, error) {
	var fs []Friendship
	if err := s.db.Where("user_id = ?", userID).Order("created_at DESC, friend_id").Find(&fs).Error; err != nil {
		return nil, err
	}
	ids := make([]string, len(fs))
	for i, f := range fs {
		ids[i] = f.FriendID
	}
	info, err := s.owners(ids)
	if err != nil {
		return nil, err
	}
	out := make([]Friend, len(fs))
	for i, f := range fs {
		out[i] = Friend{f.FriendID, info.name(f.FriendID), f.CreatedAt}
	}
	return out, nil
}

// Remove ends a friendship in both directions. Cheers and comments stay but nobody outside the friendship sees them.
func (s *Service) Remove(userID, friendID string) error {
	return s.db.Where("(user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)",
		userID, friendID, friendID, userID).Delete(&Friendship{}).Error
}

func (s *Service) friendIDs(userID string) ([]string, error) {
	var ids []string
	err := s.db.Model(&Friendship{}).Where("user_id = ?", userID).Pluck("friend_id", &ids).Error
	return ids, err
}

func (s *Service) isFriend(userID, otherID string) (bool, error) {
	var n int64
	err := s.db.Model(&Friendship{}).Where("user_id = ? AND friend_id = ?", userID, otherID).Count(&n).Error
	return n > 0, err
}

// ownerInfo is what friends see of a user's settings: the nickname and whether gym check-ins are shared.
type ownerInfo map[string]settings.Row

func (o ownerInfo) name(id string) string {
	if n := strings.TrimSpace(o[id].Nickname); n != "" {
		return n
	}
	return DefaultName
}

// sharesGym: the gym check-ins of a user are shared only while settings.shareFriends is on.
func (o ownerInfo) sharesGym(id string) bool { return o[id].ShareFriends }

// owners reads the settings rows directly (settings.Service.Get would store defaults for a user who has none).
func (s *Service) owners(ids []string) (ownerInfo, error) {
	out := ownerInfo{}
	if len(ids) == 0 {
		return out, nil
	}
	var rows []settings.Row
	if err := s.db.Select("user_id", "nickname", "share_friends", "gym_enabled").
		Where("user_id IN ?", ids).Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.UserID] = r
	}
	return out, nil
}

// ---- 게시물 ----

// key names a post: "meal:<owner>:<date>:<index>" or "gym:<owner>:<date>".
type key struct {
	Owner string
	Kind  string
	Date  platform.Date
	Index int // 0 for gym
}

func (k key) String() string {
	if k.Kind == KindGym {
		return fmt.Sprintf("gym:%s:%s", k.Owner, k.Date)
	}
	return fmt.Sprintf("meal:%s:%s:%d", k.Owner, k.Date, k.Index)
}

func parseKey(s string) (key, error) {
	bad := platform.Invalid("postId", "형식이 잘못됐어요")
	p := strings.Split(s, ":")
	if len(p) < 3 || p[1] == "" {
		return key{}, bad
	}
	d, err := platform.ParseDate(p[2])
	if err != nil {
		return key{}, bad
	}
	switch {
	case p[0] == KindGym && len(p) == 3:
		return key{p[1], KindGym, d, 0}, nil
	case p[0] == KindMeal && len(p) == 4:
		i, err := strconv.Atoi(p[3])
		if err != nil || i < 1 || i > 6 {
			return key{}, bad
		}
		return key{p[1], KindMeal, d, i}, nil
	}
	return key{}, bad
}

// Post is one feed item: a friend's shared meal or verified gym check-in.
type Post struct {
	ID        string          `json:"id"`
	FriendID  string          `json:"friendId"`
	Name      string          `json:"name"`
	Kind      string          `json:"kind"`
	Date      platform.Date   `json:"date"`
	MealIndex *int            `json:"mealIndex"` // null for gym
	LoggedAt  time.Time       `json:"loggedAt"`  // meal: logged_at, gym: check_in_at
	Items     []string        `json:"items"`     // food names (empty for gym)
	Nutrition *meal.Nutrition `json:"nutrition"` // what was eaten (meal.NutritionOf), null for gym
	HasPhoto  bool            `json:"hasPhoto"`  // GET /api/friends/photo?postId= has the meal photo
	Cheers    int             `json:"cheers"`
	Cheered   bool            `json:"cheered"`
	Comments  int             `json:"comments"`

	key key
}

func mealPost(m meal.Log) Post {
	i := m.Index
	n := meal.NutritionOf(m)
	k := key{m.UserID, KindMeal, m.Date, m.Index}
	return Post{ID: k.String(), FriendID: m.UserID, Kind: KindMeal, Date: m.Date, MealIndex: &i, LoggedAt: m.LoggedAt,
		Items: []string{}, Nutrition: &n, key: k}
}

func gymPost(g gym.Log) Post {
	k := key{g.UserID, KindGym, g.Date, 0}
	return Post{ID: k.String(), FriendID: g.UserID, Kind: KindGym, Date: g.Date, LoggedAt: *g.CheckInAt,
		Items: []string{}, key: k}
}

// sharedMeals and sharedGyms are the queries of the posts friends may see.
func (s *Service) sharedMeals(owners []string) *gorm.DB {
	return s.db.Model(&meal.Log{}).Where("user_id IN ? AND share_friends = ?", owners, true)
}

func (s *Service) sharedGyms(owners []string) *gorm.DB {
	return s.db.Model(&gym.Log{}).Where("user_id IN ? AND verified_by IN ? AND check_in_at IS NOT NULL", owners, gymShared)
}

// decorate fills names, food names, photo flags, cheer and comment counts of posts with a few queries.
func (s *Service) decorate(viewer string, posts []Post, info ownerInfo) error {
	if len(posts) == 0 {
		return nil
	}
	ownerSet, dateSet := map[string]bool{}, map[platform.Date]bool{}
	byKey := map[key]*Post{}
	for i := range posts {
		p := &posts[i]
		p.Name = info.name(p.FriendID)
		ownerSet[p.FriendID], dateSet[p.Date] = true, true
		byKey[p.key] = p
	}
	owners, dates := keys(ownerSet), keys(dateSet)

	// 음식 이름
	var logs []meal.Log
	if err := s.db.Select("id", "user_id", "meal_date", "meal_index").
		Where("user_id IN ? AND meal_date IN ?", owners, dates).Find(&logs).Error; err != nil {
		return err
	}
	logKey := map[string]key{}
	for _, l := range logs {
		logKey[l.ID] = key{l.UserID, KindMeal, l.Date, l.Index}
	}
	if len(logKey) > 0 {
		var items []meal.ItemRow
		if err := s.db.Select("meal_log_id", "position", "name").Where("meal_log_id IN ?", keys(logKey)).
			Order("meal_log_id, position").Find(&items).Error; err != nil {
			return err
		}
		for _, it := range items {
			if p := byKey[logKey[it.MealLogID]]; p != nil {
				p.Items = append(p.Items, it.Name)
			}
		}
	}

	// 사진
	var photos []photo.MealPhoto
	if err := s.db.Select("user_id", "meal_date", "meal_index").
		Where("user_id IN ? AND meal_date IN ?", owners, dates).Find(&photos).Error; err != nil {
		return err
	}
	for _, ph := range photos {
		if p := byKey[key{ph.UserID, KindMeal, ph.Date, ph.Index}]; p != nil {
			p.HasPhoto = true
		}
	}

	// 응원
	var cheers []Cheer
	if err := s.db.Where("owner_id IN ? AND post_date IN ?", owners, dates).Find(&cheers).Error; err != nil {
		return err
	}
	for _, c := range cheers {
		if p := byKey[key{c.OwnerID, c.Kind, c.PostDate, c.MealIndex}]; p != nil {
			p.Cheers++
			if c.UserID == viewer {
				p.Cheered = true
			}
		}
	}

	// 댓글 수
	var counts []struct {
		OwnerID   string
		Kind      string
		PostDate  platform.Date
		MealIndex int
		N         int
	}
	if err := s.db.Model(&Comment{}).Select("owner_id, kind, post_date, meal_index, COUNT(*) AS n").
		Where("owner_id IN ? AND post_date IN ?", owners, dates).
		Group("owner_id, kind, post_date, meal_index").Scan(&counts).Error; err != nil {
		return err
	}
	for _, c := range counts {
		if p := byKey[key{c.OwnerID, c.Kind, c.PostDate, c.MealIndex}]; p != nil {
			p.Comments = c.N
		}
	}
	return nil
}

func keys[K comparable, V any](m map[K]V) []K {
	out := make([]K, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func newestFirst(posts []Post) {
	sort.SliceStable(posts, func(i, j int) bool {
		if !posts[i].LoggedAt.Equal(posts[j].LoggedAt) {
			return posts[i].LoggedAt.After(posts[j].LoggedAt)
		}
		return posts[i].ID > posts[j].ID
	})
}

// Feed is one page of the friends' posts, newest first. NextCursor (null on the last page) goes to ?before=.
type Feed struct {
	Posts      []Post  `json:"posts"`
	NextCursor *string `json:"nextCursor"`
}

// FormatCursor and ParseCursor: the cursor is the post time (RFC 3339, nanoseconds) of the page's last post.
func FormatCursor(t time.Time) string { return t.UTC().Format(time.RFC3339Nano) }

func ParseCursor(s string) (*time.Time, error) {
	if s == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		return nil, platform.Invalid("before", "형식이 잘못됐어요")
	}
	t = t.UTC()
	return &t, nil
}

// Feed returns the posts of all friends older than before (nil = newest), at most limit (posts with the same time
// as the page's last post are kept on the same page, so the strict "older than" of the next page skips none).
func (s *Service) Feed(userID string, before *time.Time, limit int) (Feed, error) {
	if limit <= 0 {
		limit = DefaultLimit
	}
	limit = min(limit, MaxLimit)
	out := Feed{Posts: []Post{}}
	ids, err := s.friendIDs(userID)
	if err != nil || len(ids) == 0 {
		return out, err
	}
	info, err := s.owners(ids)
	if err != nil {
		return out, err
	}
	var gymOwners []string
	for _, id := range ids {
		if info.sharesGym(id) {
			gymOwners = append(gymOwners, id)
		}
	}

	var meals []meal.Log
	q := s.sharedMeals(ids)
	if before != nil {
		q = q.Where("logged_at < ?", *before)
	}
	if err := q.Order("logged_at DESC").Limit(limit + 1).Find(&meals).Error; err != nil {
		return out, err
	}
	var gyms []gym.Log
	if len(gymOwners) > 0 {
		q := s.sharedGyms(gymOwners)
		if before != nil {
			q = q.Where("check_in_at < ?", *before)
		}
		if err := q.Order("check_in_at DESC").Limit(limit + 1).Find(&gyms).Error; err != nil {
			return out, err
		}
	}
	all := make([]Post, 0, len(meals)+len(gyms))
	for _, m := range meals {
		all = append(all, mealPost(m))
	}
	for _, g := range gyms {
		all = append(all, gymPost(g))
	}
	newestFirst(all)

	n := min(limit, len(all))
	for n > 0 && n < len(all) && all[n].LoggedAt.Equal(all[n-1].LoggedAt) {
		n++
	}
	more := n < len(all) || len(meals) > limit || len(gyms) > limit
	page := all[:n]
	if err := s.decorate(userID, page, info); err != nil {
		return out, err
	}
	out.Posts = page
	if more && n > 0 {
		c := FormatCursor(page[n-1].LoggedAt)
		out.NextCursor = &c
	}
	return out, nil
}

// ---- 친구의 하루 ----

// PlannedMeal is a meal slot of the friend's settings with nothing logged yet that day.
type PlannedMeal struct {
	MealIndex int    `json:"mealIndex"`
	Deadline  string `json:"deadline"` // HH:mm, the friend's local time
}

// DaySummary: logged = shared meals of the day, meals = the friend's number of meal slots; gymDone = a shared
// verified check-in, gymPlanned = the day is one of the friend's gym days (only while gym sharing is on).
type DaySummary struct {
	Logged     int  `json:"logged"`
	Meals      int  `json:"meals"`
	GymDone    bool `json:"gymDone"`
	GymPlanned bool `json:"gymPlanned"`
}

type Day struct {
	Friend  Friend        `json:"friend"`
	Date    platform.Date `json:"date"`
	Entries []Post        `json:"entries"` // shared posts of the day, in time order
	Planned []PlannedMeal `json:"planned"`
	Summary DaySummary    `json:"summary"`
}

// Day is the friend's shared records of one day. Meals logged but not shared are left out entirely (not even as
// planned), so nothing about them shows.
func (s *Service) Day(userID, friendID string, date platform.Date) (Day, error) {
	f, err := s.friend(userID, friendID)
	if err != nil {
		return Day{}, err
	}
	info, err := s.owners([]string{friendID})
	if err != nil {
		return Day{}, err
	}
	out := Day{Friend: f, Date: date, Entries: []Post{}, Planned: []PlannedMeal{}}

	var meals []meal.Log
	if err := s.db.Where("user_id = ? AND meal_date = ?", friendID, date).Find(&meals).Error; err != nil {
		return Day{}, err
	}
	logged := map[int]bool{}
	for _, m := range meals {
		logged[m.Index] = true
		if m.ShareFriends {
			out.Entries = append(out.Entries, mealPost(m))
		}
	}
	out.Summary.Logged = len(out.Entries)
	if info.sharesGym(friendID) {
		var gyms []gym.Log
		if err := s.sharedGyms([]string{friendID}).Where("gym_date = ?", date).Find(&gyms).Error; err != nil {
			return Day{}, err
		}
		for _, g := range gyms {
			out.Entries = append(out.Entries, gymPost(g))
			out.Summary.GymDone = true
		}
		row := info[friendID]
		if row.GymEnabled {
			var n int64
			if err := s.db.Model(&settings.DayRow{}).Where("user_id = ? AND weekday = ?", friendID, date.Weekday0()).
				Count(&n).Error; err != nil {
				return Day{}, err
			}
			out.Summary.GymPlanned = n > 0
		}
	}
	sort.SliceStable(out.Entries, func(i, j int) bool { return out.Entries[i].LoggedAt.Before(out.Entries[j].LoggedAt) })

	var slots []settings.SlotRow
	if err := s.db.Where("user_id = ?", friendID).Order("idx").Find(&slots).Error; err != nil {
		return Day{}, err
	}
	out.Summary.Meals = len(slots)
	for _, sl := range slots {
		if !logged[sl.Idx] {
			out.Planned = append(out.Planned, PlannedMeal{sl.Idx, sl.Deadline})
		}
	}
	return out, s.decorate(userID, out.Entries, info)
}

// ---- 응원·댓글·사진 ----

// visible checks that the viewer may see the post (the owner or a friend of the owner) and that it is shared.
// Anything else is 404, so a non-friend learns nothing.
func (s *Service) visible(viewer, postID string) (key, error) {
	k, err := parseKey(postID)
	if err != nil {
		return key{}, err
	}
	if k.Owner != viewer {
		ok, err := s.isFriend(viewer, k.Owner)
		if err != nil {
			return key{}, err
		}
		if !ok {
			return key{}, errNotFound
		}
	}
	var n int64
	if k.Kind == KindMeal {
		err = s.sharedMeals([]string{k.Owner}).Where("meal_date = ? AND meal_index = ?", k.Date, k.Index).Count(&n).Error
	} else {
		info, ierr := s.owners([]string{k.Owner})
		if ierr != nil {
			return key{}, ierr
		}
		if info.sharesGym(k.Owner) {
			err = s.sharedGyms([]string{k.Owner}).Where("gym_date = ?", k.Date).Count(&n).Error
		}
	}
	if err != nil {
		return key{}, err
	}
	if n == 0 {
		return key{}, errNotFound
	}
	return k, nil
}

// CheerState is a post's cheers after a toggle.
type CheerState struct {
	PostID  string `json:"postId"`
	Cheers  int    `json:"cheers"`
	Cheered bool   `json:"cheered"`
}

// SetCheer adds (on) or removes the viewer's cheer; both are idempotent.
func (s *Service) SetCheer(userID, postID string, on bool) (CheerState, error) {
	k, err := s.visible(userID, postID)
	if err != nil {
		return CheerState{}, err
	}
	where := "user_id = ? AND owner_id = ? AND kind = ? AND post_date = ? AND meal_index = ?"
	if on {
		c := Cheer{UserID: userID, OwnerID: k.Owner, Kind: k.Kind, PostDate: k.Date, MealIndex: k.Index,
			CreatedAt: time.Now().UTC()}
		err = s.db.Omit("User", "Owner").Clauses(clause.OnConflict{DoNothing: true}).Create(&c).Error
	} else {
		err = s.db.Where(where, userID, k.Owner, k.Kind, k.Date, k.Index).Delete(&Cheer{}).Error
	}
	if err != nil {
		return CheerState{}, err
	}
	var n int64
	if err := s.db.Model(&Cheer{}).Where("owner_id = ? AND kind = ? AND post_date = ? AND meal_index = ?",
		k.Owner, k.Kind, k.Date, k.Index).Count(&n).Error; err != nil {
		return CheerState{}, err
	}
	return CheerState{k.String(), int(n), on}, nil
}

// CommentView is one comment as shown under a post.
type CommentView struct {
	ID        string    `json:"id"`
	PostID    string    `json:"postId"`
	AuthorID  string    `json:"authorId"`
	Name      string    `json:"name"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"createdAt"`
	Mine      bool      `json:"mine"`
}

// Comments of a post, oldest first.
func (s *Service) Comments(userID, postID string) ([]CommentView, error) {
	k, err := s.visible(userID, postID)
	if err != nil {
		return nil, err
	}
	var cs []Comment
	if err := s.db.Where("owner_id = ? AND kind = ? AND post_date = ? AND meal_index = ?", k.Owner, k.Kind, k.Date, k.Index).
		Order("created_at, id").Find(&cs).Error; err != nil {
		return nil, err
	}
	authors := map[string]bool{}
	for _, c := range cs {
		authors[c.AuthorID] = true
	}
	info, err := s.owners(keys(authors))
	if err != nil {
		return nil, err
	}
	out := make([]CommentView, len(cs))
	for i, c := range cs {
		out[i] = CommentView{c.ID, k.String(), c.AuthorID, info.name(c.AuthorID), c.Body, c.CreatedAt, c.AuthorID == userID}
	}
	return out, nil
}

// AddComment stores a comment (1~300 characters after trimming).
func (s *Service) AddComment(userID, postID, body string) (CommentView, error) {
	body = strings.TrimSpace(body)
	if n := utf8.RuneCountInString(body); n < 1 || n > maxComment {
		return CommentView{}, platform.Invalid("body", "1~300자여야 해요")
	}
	k, err := s.visible(userID, postID)
	if err != nil {
		return CommentView{}, err
	}
	c := Comment{ID: uuid.NewString(), AuthorID: userID, OwnerID: k.Owner, Kind: k.Kind, PostDate: k.Date,
		MealIndex: k.Index, Body: body, CreatedAt: time.Now().UTC()}
	if err := s.db.Omit("Author", "Owner").Create(&c).Error; err != nil {
		return CommentView{}, err
	}
	info, err := s.owners([]string{userID})
	if err != nil {
		return CommentView{}, err
	}
	return CommentView{c.ID, k.String(), userID, info.name(userID), c.Body, c.CreatedAt, true}, nil
}

// DeleteComment removes the user's own comment; someone else's comment (or none) is 404.
func (s *Service) DeleteComment(userID, id string) error {
	res := s.db.Where("id = ? AND author_id = ?", id, userID).Delete(&Comment{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return platform.NotFound("댓글을 찾을 수 없어요")
	}
	return nil
}

// Photo returns the backed-up photo of a shared meal post the viewer may see. 404 when there is none.
func (s *Service) Photo(ctx context.Context, userID, postID string) ([]byte, string, error) {
	k, err := s.visible(userID, postID)
	if err != nil {
		return nil, "", err
	}
	if k.Kind != KindMeal || s.photos == nil {
		return nil, "", errNotFound
	}
	b, ct, err := s.photos.Get(ctx, k.Owner, k.Date, k.Index)
	var pe *platform.Error
	if errors.As(err, &pe) && pe.Status == http.StatusServiceUnavailable {
		return nil, "", errNotFound // 이 서버에 사진 저장소가 없으면 친구 사진도 없다
	}
	return b, ct, err
}
