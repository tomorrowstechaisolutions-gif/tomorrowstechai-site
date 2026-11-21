import type { GuideStep } from "./script";

/**
 * Greeting a returning visitor by name, out loud.
 *
 * Her voice is recorded, not generated per visitor, so she can only say a
 * name she has a recording of. These are common first names, each recorded
 * once as "Welcome back, <name>." A visitor whose name is not here still sees
 * their name on screen and hears "Welcome back." without it.
 *
 * Adding a name here makes it show as not recorded on the Site Guide page
 * until the record button is pressed.
 */

export type Clip = Pick<GuideStep, "id" | "say">;

export const COMMON_NAMES = [
  "Aaron", "Abigail", "Adam", "Adrian", "Alan", "Albert", "Alex", "Alexander", "Alexis", "Alice", "Alicia", "Allison", "Amanda", "Amber", "Amy", "Ana", "Andrea", "Andrew", "Andy", "Angel", "Angela", "Ann", "Anna", "Anne", "Anthony", "Antonio", "April", "Ashley", "Austin",
  "Barbara", "Becky", "Ben", "Benjamin", "Beth", "Betty", "Beverly", "Bill", "Billy", "Bob", "Bobby", "Brad", "Bradley", "Brandon", "Brenda", "Brian", "Brittany", "Bruce", "Bryan",
  "Caleb", "Cameron", "Carl", "Carlos", "Carol", "Caroline", "Carolyn", "Catherine", "Chad", "Charles", "Charlie", "Charlotte", "Cheryl", "Chris", "Christian", "Christina", "Christine", "Christopher", "Cindy", "Cody", "Connie", "Connor", "Craig", "Crystal", "Cynthia",
  "Dale", "Dan", "Daniel", "Danielle", "Danny", "Darren", "Dave", "David", "Dawn", "Dean", "Deborah", "Debra", "Denise", "Dennis", "Derek", "Diana", "Diane", "Donald", "Donna", "Doris", "Dorothy", "Doug", "Douglas", "Dustin", "Dylan",
  "Ed", "Eddie", "Edward", "Eric", "Elizabeth", "Ella", "Ellen", "Emily", "Emma", "Erica", "Erin", "Ethan", "Eugene", "Eva", "Evan", "Evelyn",
  "Frances", "Francisco", "Frank", "Fred",
  "Gabriel", "Gary", "George", "Gerald", "Gloria", "Grace", "Greg", "Gregory",
  "Hannah", "Harold", "Harry", "Heather", "Helen", "Henry", "Holly", "Howard",
  "Ian", "Isaac", "Isabella",
  "Jack", "Jackie", "Jacob", "Jacqueline", "James", "Jamie", "Jane", "Janet", "Janice", "Jared", "Jason", "Jay", "Jean", "Jeff", "Jeffrey", "Jennifer", "Jenny", "Jeremy", "Jerry", "Jesse", "Jessica", "Jesus", "Jill", "Jim", "Jimmy", "Joan", "Joe", "Joel", "John", "Johnny", "Jon", "Jonathan", "Jordan", "Jorge", "Jose", "Joseph", "Josh", "Joshua", "Joyce", "Juan", "Judith", "Judy", "Julia", "Julie", "Justin",
  "Karen", "Katherine", "Kathleen", "Kathy", "Katie", "Kayla", "Keith", "Kelly", "Ken", "Kenneth", "Kevin", "Kim", "Kimberly", "Kyle",
  "Larry", "Laura", "Lauren", "Lawrence", "Leah", "Lee", "Leslie", "Linda", "Lisa", "Logan", "Lori", "Louis", "Lucas", "Luis", "Luke", "Lynn",
  "Madison", "Manuel", "Marcus", "Margaret", "Maria", "Marie", "Marilyn", "Mario", "Mark", "Martha", "Martin", "Mary", "Mason", "Matt", "Matthew", "Megan", "Melissa", "Michael", "Michelle", "Miguel", "Mike", "Monica",
  "Nancy", "Natalie", "Nathan", "Nicholas", "Nick", "Nicole", "Noah",
  "Olivia", "Oscar",
  "Pam", "Pamela", "Pat", "Patricia", "Patrick", "Paul", "Paula", "Pedro", "Peggy", "Peter", "Phil", "Philip", "Phillip",
  "Rachel", "Ralph", "Randy", "Ray", "Raymond", "Rebecca", "Ricardo", "Richard", "Rick", "Ricky", "Rob", "Robert", "Roberto", "Robin", "Roger", "Ron", "Ronald", "Rose", "Roy", "Russell", "Ruth", "Ryan",
  "Sam", "Samantha", "Samuel", "Sandra", "Sara", "Sarah", "Scott", "Sean", "Shannon", "Sharon", "Shawn", "Sheila", "Shirley", "Sophia", "Stacy", "Stephanie", "Stephen", "Steve", "Steven", "Sue", "Susan",
  "Tammy", "Taylor", "Teresa", "Terry", "Theresa", "Thomas", "Tiffany", "Tim", "Timothy", "Tina", "Todd", "Tom", "Tommy", "Tony", "Tracy", "Travis", "Trevor", "Tyler",
  "Valerie", "Vanessa", "Veronica", "Victor", "Victoria", "Vincent", "Virginia",
  "Walter", "Wanda", "Wayne", "Wendy", "Will", "William", "Willie",
  "Zach", "Zachary",
] as const;

/** A name as a key: its first word, lower case, letters only. "  JOHN c. Hockinson" is "john". */
export function nameKey(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first.toLowerCase().replace(/[^a-z]/g, "");
}

const BY_KEY = new Map(COMMON_NAMES.map((n) => [n.toLowerCase(), n as string]));

/** "Welcome back." with no name, for a visitor whose name she has no recording of. */
export const BACK_CLIP: Clip = { id: "back", say: "Welcome back." };

/** The first question again, without the "Thanks" a first-time visitor hears. */
export const ASK_AGAIN_CLIP: Clip = { id: "ask-again", say: "What brought you here today?" };

/** The recording that greets this visitor by name, or null when their name is not one she can say. */
export function nameClip(name: string | null | undefined): Clip | null {
  const known = BY_KEY.get(nameKey(name));
  return known ? { id: `back-${known.toLowerCase()}`, say: `Welcome back, ${known}.` } : null;
}

/** Every recording that is not a step of the script: the two plain lines and one per name. */
export function greetingClips(): Clip[] {
  return [BACK_CLIP, ASK_AGAIN_CLIP, ...COMMON_NAMES.map((n) => nameClip(n)!)];
}
