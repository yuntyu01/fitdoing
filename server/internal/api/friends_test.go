package api

import (
	"bytes"
	"fmt"
	"net/url"
	"strings"
	"testing"
)

// user is one logged-in test user.
type user struct {
	tok, id string
}

func (e *env) user(subject string) user {
	e.t.Helper()
	tok, id := e.login(subject)
	return user{tok, id}
}

// profile sets the nickname and the default friend sharing (which also shares gym check-ins).
func (e *env) profile(u user, nickname string, share bool) {
	e.t.Helper()
	st := e.do("GET", "/api/settings", "", u.tok).is(e.t, 200).Body["settings"].(map[string]any)
	st["nickname"], st["shareFriends"] = nickname, share
	e.do("PUT", "/api/settings", js(st), u.tok).is(e.t, 200)
}

// befriend makes a and b friends (b adds a by a's code).
func (e *env) befriend(a, b user) {
	e.t.Helper()
	code := e.do("GET", "/api/friends/code", "", a.tok).is(e.t, 200).Body["code"].(string)
	e.do("POST", "/api/friends", js(map[string]string{"code": code}), b.tok).is(e.t, 200)
}

func (e *env) logMeal(u user, date string, index int, share bool, loggedAt string) {
	e.t.Helper()
	body := fmt.Sprintf(`{"date":"%s","index":%d,"portion":1,"sharedMeal":false,"shareFriends":%v,"loggedAt":"%s",
	 "ai":{"items":[{"name":"밥","amount":"1공기"},{"name":"김치","amount":"1접시"}],"kcal":500,"carbs":60,"protein":20,"fat":10,"confidence":0.8}}`,
		date, index, share, loggedAt)
	e.do("POST", "/api/meals", body, u.tok).is(e.t, 200)
}

func (e *env) checkIn(u user, date, by, at string) {
	e.t.Helper()
	e.do("POST", "/api/gym/check-in", js(map[string]string{"date": date, "verifiedBy": by, "checkInAt": at}), u.tok).is(e.t, 200)
}

func (e *env) feed(u user, query string) resp {
	e.t.Helper()
	return e.do("GET", "/api/friends/feed"+query, "", u.tok).is(e.t, 200)
}

func postBody(postID string) string { return js(map[string]string{"postId": postID}) }

func q(s string) string { return url.QueryEscape(s) }

func TestFriendCodeAndAdd(t *testing.T) {
	e := newEnv(t)
	a := user{e.tok, e.uid}
	b := e.user("friend-b")

	code := e.do("GET", "/api/friends/code", "", a.tok).is(t, 200).Body["code"].(string)
	if len(code) != 8 || strings.ContainsAny(code, "01ILO") || strings.ToUpper(code) != code {
		t.Fatalf("code %q: want 8 unambiguous upper-case characters", code)
	}
	if again := e.do("GET", "/api/friends/code", "", a.tok).Body["code"]; again != code {
		t.Fatalf("code changed: %v -> %v", code, again)
	}
	if other := e.do("GET", "/api/friends/code", "", b.tok).Body["code"]; other == code {
		t.Fatal("two users got the same code")
	}

	e.do("POST", "/api/friends", js(map[string]string{"code": code}), a.tok).code(t, 400, "CANNOT_ADD_SELF")
	e.do("POST", "/api/friends", js(map[string]string{"code": "ZZZZZZZZ"}), b.tok).code(t, 404, "FRIEND_CODE_NOT_FOUND")
	e.do("POST", "/api/friends", js(map[string]string{"code": ""}), b.tok).code(t, 400, "INVALID")

	// typed loosely: lower case with a dash and spaces
	typed := strings.ToLower(code[:4]) + "-" + code[4:] + " "
	r := e.do("POST", "/api/friends", js(map[string]string{"code": typed}), b.tok).is(t, 200)
	r.eq(t, "id", a.id)
	r.eq(t, "name", "친구") // no nickname yet
	e.profile(a, "민수", false)
	e.do("POST", "/api/friends", js(map[string]string{"code": code}), b.tok).is(t, 200).eq(t, "name", "민수") // idempotent

	// symmetric, one row each way
	la := e.do("GET", "/api/friends", "", a.tok).is(t, 200)
	lb := e.do("GET", "/api/friends", "", b.tok).is(t, 200)
	if len(la.List) != 1 || len(lb.List) != 1 || e.count("friendships") != 2 {
		t.Fatalf("lists %d/%d, rows %d", len(la.List), len(lb.List), e.count("friendships"))
	}
	if at(t, la.List[0], "id") != b.id || at(t, lb.List[0], "name") != "민수" || at(t, lb.List[0], "since") == nil {
		t.Fatalf("lists: %s / %s", la.Raw, lb.Raw)
	}

	// removing from either side removes both directions
	e.do("DELETE", "/api/friends/"+a.id, "", b.tok).is(t, 204)
	if e.count("friendships") != 0 {
		t.Fatal("friendship left after remove")
	}
	if l := e.do("GET", "/api/friends", "", a.tok); len(l.List) != 0 {
		t.Fatalf("a still has friends: %s", l.Raw)
	}
	e.do("GET", "/api/friends", "", "").code(t, 401, "UNAUTHORIZED")
}

func TestFriendFeedShowsOnlySharedPostsOfFriends(t *testing.T) {
	e := newEnv(t)
	a := user{e.tok, e.uid}
	b, c := e.user("friend-b"), e.user("stranger-c")
	e.befriend(a, b)
	e.profile(b, "서준", false)

	e.logMeal(b, "2026-09-28", 1, true, "2026-09-28T00:10:00Z")
	e.logMeal(b, "2026-09-28", 2, false, "2026-09-28T03:10:00Z") // not shared
	e.logMeal(c, "2026-09-28", 1, true, "2026-09-28T01:00:00Z")  // shared, but not a friend
	e.logMeal(a, "2026-09-28", 1, true, "2026-09-28T02:00:00Z")  // my own meal is not in my feed
	e.checkIn(b, "2026-09-28", "geofence", "2026-09-28T09:00:00Z")

	// gym check-ins are shared only while the owner's settings.shareFriends is on
	r := e.feed(a, "")
	r.size(t, "posts", 1)
	r.eq(t, "posts.0.id", "meal:"+b.id+":2026-09-28:1")
	r.eq(t, "posts.0.friendId", b.id)
	r.eq(t, "posts.0.name", "서준")
	r.eq(t, "posts.0.kind", "meal")
	r.eq(t, "posts.0.date", "2026-09-28")
	r.eq(t, "posts.0.mealIndex", 1)
	r.eq(t, "posts.0.items", []any{"밥", "김치"})
	r.eq(t, "posts.0.nutrition.kcal", 500)
	r.eq(t, "posts.0.hasPhoto", false)
	r.eq(t, "posts.0.cheers", 0)
	r.eq(t, "nextCursor", nil)

	e.profile(b, "서준", true)
	e.checkIn(b, "2026-09-29", "photo", "2026-09-29T09:00:00Z")
	r = e.feed(a, "")
	r.size(t, "posts", 3) // newest first: gym 29th, gym 28th, meal 28th
	r.eq(t, "posts.0.id", "gym:"+b.id+":2026-09-29")
	r.eq(t, "posts.0.kind", "gym")
	r.eq(t, "posts.0.mealIndex", nil)
	r.eq(t, "posts.0.nutrition", nil)
	r.eq(t, "posts.1.id", "gym:"+b.id+":2026-09-28")
	r.eq(t, "posts.2.kind", "meal")

	// a rest-coupon day is not a workout
	e.do("POST", "/api/coupons/rest?date=2026-09-30", "", b.tok).is(t, 200)
	e.feed(a, "").size(t, "posts", 3)

	// strangers see nothing of b
	e.feed(c, "").size(t, "posts", 0)
	mealID := "meal:" + b.id + ":2026-09-28:1"
	e.do("POST", "/api/friends/cheers", postBody(mealID), c.tok).code(t, 404, "NOT_FOUND")
	e.do("GET", "/api/friends/comments?postId="+q(mealID), "", c.tok).code(t, 404, "NOT_FOUND")
	e.do("GET", "/api/friends/"+b.id+"/day?date=2026-09-28", "", c.tok).code(t, 404, "NOT_FOUND")
	// the unshared meal is invisible even to a friend
	e.do("POST", "/api/friends/cheers", postBody("meal:"+b.id+":2026-09-28:2"), a.tok).code(t, 404, "NOT_FOUND")
	e.do("POST", "/api/friends/cheers", postBody("bogus"), a.tok).code(t, 400, "INVALID")

	// sharing turned off again hides the gym posts
	e.profile(b, "서준", false)
	e.feed(a, "").size(t, "posts", 1)
	e.do("POST", "/api/friends/cheers", postBody("gym:"+b.id+":2026-09-28"), a.tok).code(t, 404, "NOT_FOUND")
}

func TestFriendFeedPages(t *testing.T) {
	e := newEnv(t)
	a := user{e.tok, e.uid}
	b := e.user("friend-b")
	e.befriend(a, b)
	e.profile(b, "", true)
	for d := 1; d <= 3; d++ {
		date := fmt.Sprintf("2026-09-%02d", d)
		for i := 1; i <= 2; i++ {
			e.logMeal(b, date, i, true, fmt.Sprintf("%sT0%d:00:00Z", date, i))
		}
		e.checkIn(b, date, "geofence", date+"T09:00:00Z")
	}
	// two posts at exactly the same time stay on one page
	e.logMeal(b, "2026-09-04", 1, true, "2026-09-04T05:00:00Z")
	e.logMeal(b, "2026-09-04", 2, true, "2026-09-04T05:00:00Z")

	seen := map[string]bool{}
	var order []string
	cursor := ""
	for page := 0; page < 10; page++ {
		path := "?limit=3"
		if cursor != "" {
			path += "&before=" + q(cursor)
		}
		r := e.feed(a, path)
		for _, p := range r.Body["posts"].([]any) {
			id := at(t, p, "id").(string)
			if seen[id] {
				t.Fatalf("post %s twice", id)
			}
			seen[id] = true
			order = append(order, at(t, p, "loggedAt").(string))
		}
		next, _ := r.Body["nextCursor"].(string)
		if next == "" {
			break
		}
		cursor = next
	}
	if len(seen) != 11 {
		t.Fatalf("saw %d posts, want 11", len(seen))
	}
	for i := 1; i < len(order); i++ {
		if order[i] > order[i-1] {
			t.Fatalf("not newest first: %v", order)
		}
	}
	if order[0] != order[1] || !strings.HasPrefix(order[0], "2026-09-04T05:00:00") {
		t.Fatalf("the two posts at the same time should come first: %v", order)
	}
	e.do("GET", "/api/friends/feed?before=yesterday", "", a.tok).code(t, 400, "INVALID")
	e.do("GET", "/api/friends/feed?limit=0", "", a.tok).code(t, 400, "INVALID")
}

func TestFriendCheersAndComments(t *testing.T) {
	e := newEnv(t)
	a := user{e.tok, e.uid}
	b, d := e.user("friend-b"), e.user("friend-d") // d is b's friend, not a's
	e.befriend(a, b)
	e.befriend(b, d)
	e.profile(a, "민수", false)
	e.logMeal(b, "2026-09-28", 1, true, "2026-09-28T00:10:00Z")
	post := "meal:" + b.id + ":2026-09-28:1"

	e.do("POST", "/api/friends/cheers", postBody(post), a.tok).is(t, 200).eq(t, "cheers", 1)
	r := e.do("POST", "/api/friends/cheers", postBody(post), a.tok).is(t, 200) // once per user
	r.eq(t, "cheers", 1)
	r.eq(t, "cheered", true)
	e.do("POST", "/api/friends/cheers", postBody(post), d.tok).is(t, 200).eq(t, "cheers", 2)
	f := e.feed(a, "")
	f.eq(t, "posts.0.cheers", 2)
	f.eq(t, "posts.0.cheered", true)
	r = e.do("DELETE", "/api/friends/cheers", postBody(post), a.tok).is(t, 200)
	r.eq(t, "cheers", 1)
	r.eq(t, "cheered", false)
	e.do("DELETE", "/api/friends/cheers?postId="+q(post), "", a.tok).is(t, 200).eq(t, "cheers", 1) // query form, idempotent
	e.feed(a, "").eq(t, "posts.0.cheered", false)

	// comments
	add := func(u user, body string) resp {
		return e.do("POST", "/api/friends/comments", js(map[string]string{"postId": post, "body": body}), u.tok)
	}
	add(a, "   ").code(t, 400, "INVALID")
	add(a, strings.Repeat("가", 301)).code(t, 400, "INVALID")
	add(a, strings.Repeat("가", 300)).is(t, 201)
	c := add(a, "  맛있겠다  ").is(t, 201)
	c.eq(t, "body", "맛있겠다")
	c.eq(t, "name", "민수")
	c.eq(t, "mine", true)
	mine := c.Body["id"].(string)
	add(d, "굿").is(t, 201)
	add(b, "고마워").is(t, 201) // the owner can answer on their own post

	l := e.do("GET", "/api/friends/comments?postId="+q(post), "", b.tok).is(t, 200)
	if len(l.List) != 4 || at(t, l.List[1], "body") != "맛있겠다" || at(t, l.List[1], "mine") != false ||
		at(t, l.List[2], "name") != "친구" || at(t, l.List[3], "mine") != true {
		t.Fatalf("comments: %s", l.Raw)
	}
	e.feed(a, "").eq(t, "posts.0.comments", 4)

	// only the author deletes
	e.do("DELETE", "/api/friends/comments/"+mine, "", b.tok).code(t, 404, "NOT_FOUND")
	e.do("DELETE", "/api/friends/comments/"+mine, "", a.tok).is(t, 204)
	e.do("DELETE", "/api/friends/comments/"+mine, "", a.tok).code(t, 404, "NOT_FOUND")
	e.feed(a, "").eq(t, "posts.0.comments", 3)

	// unsharing the meal hides it with its cheers and comments
	e.logMeal(b, "2026-09-28", 1, false, "2026-09-28T00:10:00Z")
	e.feed(a, "").size(t, "posts", 0)
	e.do("GET", "/api/friends/comments?postId="+q(post), "", a.tok).code(t, 404, "NOT_FOUND")
}

func TestFriendDay(t *testing.T) {
	e := newEnv(t)
	a := user{e.tok, e.uid}
	b := e.user("friend-b")
	e.befriend(a, b)
	e.profile(b, "지우", true)
	// 2026-09-28 is a Monday, one of the default gym days; four meal slots by default
	e.logMeal(b, "2026-09-28", 2, true, "2026-09-28T03:00:00Z")
	e.logMeal(b, "2026-09-28", 1, true, "2026-09-28T00:00:00Z")
	e.logMeal(b, "2026-09-28", 3, false, "2026-09-28T06:00:00Z")
	e.checkIn(b, "2026-09-28", "geofence", "2026-09-28T09:00:00Z")
	e.logMeal(b, "2026-09-29", 1, true, "2026-09-29T00:00:00Z") // another day

	r := e.do("GET", "/api/friends/"+b.id+"/day?date=2026-09-28", "", a.tok).is(t, 200)
	r.eq(t, "friend.name", "지우")
	r.eq(t, "date", "2026-09-28")
	r.size(t, "entries", 3) // time order: meal 1, meal 2, gym; the unshared meal 3 is left out
	r.eq(t, "entries.0.mealIndex", 1)
	r.eq(t, "entries.1.mealIndex", 2)
	r.eq(t, "entries.2.kind", "gym")
	r.size(t, "planned", 1) // only meal 4: meal 3 was logged (not shared), so it is not "planned" either
	r.eq(t, "planned.0.mealIndex", 4)
	r.eq(t, "planned.0.deadline", "19:00")
	r.eq(t, "summary.logged", 2)
	r.eq(t, "summary.meals", 4)
	r.eq(t, "summary.gymDone", true)
	r.eq(t, "summary.gymPlanned", true)

	// Saturday, nothing logged, gym sharing off
	e.profile(b, "지우", false)
	r = e.do("GET", "/api/friends/"+b.id+"/day?date=2026-10-03", "", a.tok).is(t, 200)
	r.size(t, "entries", 0)
	r.size(t, "planned", 4)
	r.eq(t, "summary.gymDone", false)
	r.eq(t, "summary.gymPlanned", false)
	e.do("GET", "/api/friends/"+b.id+"/day", "", a.tok).code(t, 400, "INVALID")
	e.do("GET", "/api/friends/"+a.id+"/day?date=2026-09-28", "", a.tok).code(t, 404, "NOT_FOUND") // not my own friend
}

func TestFriendPhotoAndRemoveHidesEverything(t *testing.T) {
	e, _ := photoEnv(t)
	a := user{e.tok, e.uid}
	b, c := e.user("friend-b"), e.user("stranger-c")
	e.befriend(a, b)
	e.profile(b, "", false)
	e.logMeal(b, "2026-09-28", 1, true, "2026-09-28T00:00:00Z")
	e.logMeal(b, "2026-09-28", 2, false, "2026-09-28T03:00:00Z")
	e.logMeal(b, "2026-09-28", 3, true, "2026-09-28T06:00:00Z")
	for _, i := range []int{1, 2} {
		if w := e.upload(fmt.Sprintf("/api/meals/photo?date=2026-09-28&index=%d", i), b.tok, "image/jpeg", jpeg); w.Code != 204 {
			t.Fatalf("upload: %d %s", w.Code, w.Body)
		}
	}
	shared := "meal:" + b.id + ":2026-09-28:1"
	f := e.feed(a, "")
	f.eq(t, "posts.0.hasPhoto", false) // meal 3, no photo
	f.eq(t, "posts.1.hasPhoto", true)

	photo := func(postID, tok string) int { return e.raw("GET", "/api/friends/photo?postId="+q(postID), tok).Code }
	w := e.raw("GET", "/api/friends/photo?postId="+q(shared), a.tok)
	if w.Code != 200 || !bytes.Equal(w.Body.Bytes(), jpeg) || w.Header().Get("Content-Type") != "image/jpeg" {
		t.Fatalf("friend photo: %d", w.Code)
	}
	if photo("meal:"+b.id+":2026-09-28:2", a.tok) != 404 || // has a photo, but the meal is not shared
		photo("meal:"+b.id+":2026-09-28:3", a.tok) != 404 || // shared, no photo
		photo(shared, c.tok) != 404 { // not a friend
		t.Fatal("photo should be 404")
	}

	// a comment and a cheer, then the friendship ends: nothing is visible any more
	e.do("POST", "/api/friends/cheers", postBody(shared), a.tok).is(t, 200)
	e.do("POST", "/api/friends/comments", js(map[string]string{"postId": shared, "body": "와"}), a.tok).is(t, 201)
	e.do("DELETE", "/api/friends/"+b.id, "", a.tok).is(t, 204)
	e.feed(a, "").size(t, "posts", 0)
	e.do("GET", "/api/friends/"+b.id+"/day?date=2026-09-28", "", a.tok).code(t, 404, "NOT_FOUND")
	e.do("GET", "/api/friends/comments?postId="+q(shared), "", a.tok).code(t, 404, "NOT_FOUND")
	e.do("POST", "/api/friends/cheers", postBody(shared), a.tok).code(t, 404, "NOT_FOUND")
	if photo(shared, a.tok) != 404 {
		t.Fatal("photo after unfriend should be 404")
	}

	// account deletion cascades the friend rows
	e.befriend(a, b)
	e.do("DELETE", "/api/account", "", b.tok).is(t, 204)
	if e.count("friendships") != 0 || e.count("friend_cheers") != 0 || e.count("friend_comments") != 0 {
		t.Fatalf("friend rows left: %d %d %d", e.count("friendships"), e.count("friend_cheers"), e.count("friend_comments"))
	}
	if e.count("friend_codes") != 1 {
		t.Fatalf("friend codes = %d, want only a's", e.count("friend_codes"))
	}
}
