package platform

import (
	"encoding/json"
	"fmt"
	"time"
)

const dateLayout = "2006-01-02"

// Date is a user-local calendar date, "YYYY-MM-DD". Stored and sent as a string.
type Date string

func ParseDate(s string) (Date, error) {
	t, err := time.Parse(dateLayout, s)
	if err != nil {
		return "", fmt.Errorf("invalid date %q", s)
	}
	return Date(t.Format(dateLayout)), nil
}

func (d Date) IsZero() bool { return d == "" }

func (d Date) Time() time.Time {
	t, _ := time.Parse(dateLayout, string(d))
	return t
}

func (d Date) AddDays(n int) Date { return Date(d.Time().AddDate(0, 0, n).Format(dateLayout)) }

// Weekday0 is 0=Monday ... 6=Sunday.
func (d Date) Weekday0() int { return (int(d.Time().Weekday()) + 6) % 7 }

// Monday is the Monday of the week containing d (weeks start on Monday).
func (d Date) Monday() Date { return d.AddDays(-d.Weekday0()) }

// NextMonday is the first Monday strictly after d.
func (d Date) NextMonday() Date { return d.AddDays(7 - d.Weekday0()) }

func (d *Date) UnmarshalJSON(b []byte) error {
	var s *string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}
	if s == nil {
		*d = ""
		return nil
	}
	v, err := ParseDate(*s)
	if err != nil {
		return err
	}
	*d = v
	return nil
}

// ParseMonth parses "2026-09" and returns its first and last day.
func ParseMonth(s string) (first, last Date, err error) {
	t, err := time.Parse("2006-01", s)
	if err != nil {
		return "", "", fmt.Errorf("invalid month %q", s)
	}
	first = Date(t.Format(dateLayout))
	last = Date(t.AddDate(0, 1, -1).Format(dateLayout))
	return first, last, nil
}

// Clock gives the current instant and the current date in the service zone.
type Clock struct{ Loc *time.Location }

func (c Clock) Now() time.Time { return time.Now().UTC() }

func (c Clock) Today() Date { return Date(time.Now().In(c.Loc).Format(dateLayout)) }

// EnumJSON decodes a JSON string, lower-cases it and checks it against the allowed values.
// null decodes to "" so that required-field validation can report it.
func EnumJSON(b []byte, allowed ...string) (string, error) {
	var s *string
	if err := json.Unmarshal(b, &s); err != nil {
		return "", err
	}
	if s == nil {
		return "", nil
	}
	v := lower(*s)
	for _, a := range allowed {
		if a == v {
			return v, nil
		}
	}
	return "", fmt.Errorf("invalid value %q", *s)
}

func lower(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + 32
		}
	}
	return string(b)
}
